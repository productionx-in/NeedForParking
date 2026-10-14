import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Minimal stand-ins for the parts of Supabase that migrations depend on
 * (auth.users, auth.uid(), storage.objects, API roles, default privileges).
 * Everything else — tables, triggers, RLS, grants, RPCs — is the REAL migration SQL.
 */
const SUPABASE_SHIM = fs.readFileSync(path.resolve(import.meta.dirname, "supabase-shim.sql"), "utf8");

export type Db = PGlite;

export async function createTestDb(): Promise<Db> {
  const db = new PGlite();
  await db.exec(SUPABASE_SHIM);
  const dir = path.resolve(import.meta.dirname, "../../supabase/migrations");
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    try {
      await db.exec(fs.readFileSync(path.join(dir, file), "utf8"));
    } catch (e) {
      throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
    }
  }
  return db;
}

export type Actor =
  | { role: "anon" }
  | { role: "authenticated"; sub: string }
  | { role: "service_role" }
  | { role: "postgres" };

export const anon: Actor = { role: "anon" };
export const asUser = (sub: string): Actor => ({ role: "authenticated", sub });
export const service: Actor = { role: "service_role" };
export const superuser: Actor = { role: "postgres" };

type Tx = Parameters<Parameters<PGlite["transaction"]>[0]>[0];

/** Runs `fn` in a transaction as the given API role, mimicking PostgREST (set local role + JWT claims). */
export async function as<T>(db: Db, actor: Actor, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    if (actor.role !== "postgres") {
      await tx.query(`set local role ${actor.role}`);
      const claims = JSON.stringify(
        actor.role === "authenticated" ? { sub: actor.sub, role: "authenticated" } : { role: actor.role },
      );
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
    }
    return fn(tx);
  });
}

export async function createUser(
  db: Db,
  opts: { phone?: string | null; phoneConfirmed?: boolean; admin?: boolean; suspended?: boolean; name?: string } = {},
): Promise<string> {
  const id = randomUUID();
  const phone = opts.phone === undefined ? `+9190000${Math.floor(Math.random() * 1e5).toString().padStart(5, "0")}` : opts.phone;
  await db.query(
    `insert into auth.users (id, phone, phone_confirmed_at) values ($1, $2, $3)`,
    [id, phone, opts.phoneConfirmed === false ? null : new Date().toISOString()],
  );
  await db.query(
    `update public.profiles set display_name = $2, role = $3, account_status = $4 where id = $1`,
    [id, opts.name ?? "Test User", opts.admin ? "admin" : "user", opts.suspended ? "suspended" : "active"],
  );
  return id;
}

export const VALID_LISTING = {
  title: "Covered bay near Inorbit",
  description: "A covered car parking bay in a gated apartment complex, available on weekdays.",
  vehicle_types: ["car"],
  cover_type: "covered",
  locality: "Madhapur",
  postal_code: "500081",
  rental_type: "monthly",
  price_inr: 3500,
  min_duration: 1,
  available_days: [1, 2, 3, 4, 5],
  available_from: "08:00",
  available_to: "20:00",
  owner_declaration: true,
  permission_status: "obtained",
} as const;

export const VALID_PRIVATE = {
  address_line: "Fictional Towers, Flat 12, Test Road",
  exact_latitude: 17.4486,
  exact_longitude: 78.3908,
  access_instructions: "Gate code is shared after acceptance.",
};

/** Creates a draft listing (as the owner, via RLS) with private details. Returns its id. */
export async function createDraft(db: Db, owner: string, overrides: Record<string, unknown> = {}, priv: Partial<typeof VALID_PRIVATE> | null = {}) {
  const data = { ...VALID_LISTING, ...overrides };
  const id = await as(db, asUser(owner), async (tx) => {
    const cols = Object.keys(data);
    const res = await tx.query<{ id: string }>(
      `insert into public.parking_listings (owner_id, ${cols.join(", ")})
       values ($1, ${cols.map((_, i) => `$${i + 2}`).join(", ")}) returning id`,
      [owner, ...cols.map((c) => (data as Record<string, unknown>)[c])],
    );
    const listingId = res.rows[0]!.id;
    if (priv) {
      const p = { ...VALID_PRIVATE, ...priv };
      await tx.query(
        `insert into public.listing_private_details (listing_id, address_line, exact_latitude, exact_longitude, access_instructions)
         values ($1, $2, $3, $4, $5)`,
        [listingId, p.address_line, p.exact_latitude, p.exact_longitude, p.access_instructions],
      );
    }
    return listingId;
  });
  return id;
}

export async function addPhoto(db: Db, owner: string, listingId: string, file = `${randomUUID()}.jpg`) {
  await as(db, asUser(owner), (tx) =>
    tx.query(`insert into public.listing_photos (listing_id, storage_path) values ($1, $2)`, [listingId, `${owner}/${listingId}/${file}`]),
  );
}

export async function setStatus(db: Db, owner: string, listingId: string, status: string) {
  await as(db, asUser(owner), (tx) => tx.query(`update public.parking_listings set status = $2 where id = $1`, [listingId, status]));
}

/** Draft -> with photo -> published. */
export async function createPublished(db: Db, owner: string, overrides: Record<string, unknown> = {}, priv: Partial<typeof VALID_PRIVATE> | null = {}) {
  const id = await createDraft(db, owner, overrides, priv);
  await addPhoto(db, owner, id);
  await setStatus(db, owner, id, "published");
  return id;
}

export function futureDate(daysAhead: number): string {
  const d = new Date(Date.now() + 5.5 * 3600_000 + daysAhead * 86400_000); // IST "today" + offset
  return d.toISOString().slice(0, 10);
}

/** Asserts a promise rejects with a Postgres error whose message matches. */
export async function expectDbError(p: Promise<unknown>, pattern: RegExp | string) {
  let err: unknown;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  if (!err) throw new Error(`Expected database error matching ${pattern}, but the statement succeeded`);
  const msg = (err as Error).message;
  const ok = typeof pattern === "string" ? msg.includes(pattern) : pattern.test(msg);
  if (!ok) throw new Error(`Expected database error matching ${pattern}, got: ${msg}`);
}

/** The next date (IST) falling on `dow` (0=Sun) that is at least `minDaysAhead` days from today. */
export function nextDow(dow: number, minDaysAhead = 2): string {
  for (let i = minDaysAhead; i < minDaysAhead + 7; i++) {
    const d = futureDate(i);
    if (new Date(`${d}T00:00:00Z`).getUTCDay() === dow) return d;
  }
  throw new Error("unreachable");
}

export function addDays(date: string, n: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + n * 86400_000).toISOString().slice(0, 10);
}

export type RequestInput = {
  schedule_type?: "one_time" | "recurring";
  start_date: string;
  end_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  recurring_days?: number[] | null;
  vehicle_type?: string;
  message?: string;
};

export async function createRequest(db: Db, requester: string, listingId: string, input: RequestInput): Promise<string> {
  const r = {
    schedule_type: "one_time",
    end_date: input.start_date,
    start_time: null,
    end_time: null,
    recurring_days: null,
    vehicle_type: "car",
    message: "Hello, is this still free?",
    ...input,
  };
  return as(db, asUser(requester), async (tx) => {
    const res = await tx.query<{ id: string }>(
      `insert into public.booking_requests
         (listing_id, requester_id, schedule_type, start_date, end_date, start_time, end_time, recurring_days, vehicle_type, message)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
      [listingId, requester, r.schedule_type, r.start_date, r.end_date, r.start_time, r.end_time, r.recurring_days, r.vehicle_type, r.message],
    );
    return res.rows[0]!.id;
  });
}

export async function setRequestStatus(db: Db, actor: string, requestId: string, status: string, response: string | null = null) {
  const res = await as(db, asUser(actor), (tx) =>
    tx.query(`update public.booking_requests set status = $2, owner_response = coalesce($3, owner_response) where id = $1`, [requestId, status, response]),
  );
  return res.affectedRows ?? 0;
}
