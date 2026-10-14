import { describe, it, expect, beforeAll } from "vitest";
import {
  createTestDb, createUser, createPublished, createDraft, setStatus, as, asUser, anon, service, expectDbError,
  createRequest, setRequestStatus, nextDow, addDays, futureDate, type Db,
} from "./helpers";

describe("booking requests: creation rules", () => {
  let db: Db;
  let owner: string;
  let renter: string;
  let listing: string; // Mon-Fri 08:00-20:00, cars only, monthly, min 1 month
  let hourly: string;
  const monday = () => nextDow(1);

  beforeAll(async () => {
    db = await createTestDb();
    owner = await createUser(db, { name: "Owner" });
    renter = await createUser(db, { name: "Renter" });
    listing = await createPublished(db, owner, { rental_type: "daily", min_duration: 2 });
    hourly = await createPublished(db, owner, { rental_type: "hourly", min_duration: 2, price_inr: 40 });
  });

  it("an authenticated, phone-verified user can request a published listing; it starts as pending", async () => {
    const m = monday();
    const id = await createRequest(db, renter, listing, { start_date: m, end_date: addDays(m, 1) });
    const r = await db.query<{ status: string; requester_id: string }>(`select status, requester_id from public.booking_requests where id = $1`, [id]);
    expect(r.rows[0]).toEqual({ status: "pending", requester_id: renter });
  });

  it("visitors (anon) cannot create requests", async () => {
    await expectDbError(
      as(db, anon, (tx) => tx.query(`insert into public.booking_requests (listing_id, requester_id, schedule_type, start_date, end_date, vehicle_type) values ($1, $2, 'one_time', $3, $3, 'car')`, [listing, renter, monday()])),
      /permission denied/,
    );
  });

  it("owners cannot request their own space", async () => {
    await expectDbError(createRequest(db, owner, listing, { start_date: monday(), end_date: addDays(monday(), 1) }), /row-level security|own_listing/);
  });

  it("owners are also blocked at trigger level when RLS is bypassed (service role)", async () => {
    await expectDbError(
      as(db, service, (tx) => tx.query(`insert into public.booking_requests (listing_id, requester_id, schedule_type, start_date, end_date, vehicle_type) values ($1, $2, 'one_time', $3, $4, 'car')`, [listing, owner, monday(), addDays(monday(), 1)])),
      /own_listing/,
    );
  });

  it("users cannot create requests on behalf of someone else", async () => {
    const victim = await createUser(db);
    await expectDbError(
      as(db, asUser(renter), (tx) => tx.query(`insert into public.booking_requests (listing_id, requester_id, schedule_type, start_date, end_date, vehicle_type) values ($1, $2, 'one_time', $3, $4, 'car')`, [listing, victim, monday(), addDays(monday(), 1)])),
      /row-level security/,
    );
  });

  it("users without a verified phone, or suspended users, cannot request", async () => {
    const unverified = await createUser(db, { phoneConfirmed: false });
    await expectDbError(createRequest(db, unverified, listing, { start_date: monday(), end_date: addDays(monday(), 1) }), /row-level security/);
    const suspended = await createUser(db, { suspended: true });
    await expectDbError(createRequest(db, suspended, listing, { start_date: monday(), end_date: addDays(monday(), 1) }), /row-level security/);
  });

  it("rejects end date before start date", async () => {
    await expectDbError(createRequest(db, renter, listing, { start_date: addDays(monday(), 3), end_date: monday() }), /request_date_range/);
  });

  it("rejects start dates in the past", async () => {
    await expectDbError(createRequest(db, renter, listing, { start_date: futureDate(-3), end_date: futureDate(-2) }), /past_date/);
  });

  it("rejects one-time requests without an end date and recurring requests without days", async () => {
    await expectDbError(createRequest(db, renter, listing, { start_date: monday(), end_date: null }), /request_one_time_needs_end/);
    await expectDbError(createRequest(db, renter, listing, { schedule_type: "recurring", start_date: monday(), end_date: null, recurring_days: null }), /request_recurring_days/);
    await expectDbError(createRequest(db, renter, listing, { schedule_type: "recurring", start_date: monday(), end_date: null, recurring_days: [] }), /request_recurring_days/);
    await expectDbError(createRequest(db, renter, listing, { schedule_type: "recurring", start_date: monday(), end_date: null, recurring_days: [9] }), /request_recurring_days/);
  });

  it("rejects ranges longer than a year and inverted time windows", async () => {
    await expectDbError(createRequest(db, renter, listing, { start_date: monday(), end_date: addDays(monday(), 400) }), /request_max_span/);
    await expectDbError(createRequest(db, renter, hourly, { start_date: monday(), start_time: "14:00", end_time: "10:00" }), /request_time_window/);
    await expectDbError(createRequest(db, renter, hourly, { start_date: monday(), start_time: "10:00", end_time: null }), /request_time_window/);
  });

  it("rejects unsupported vehicle types", async () => {
    await expectDbError(createRequest(db, renter, listing, { start_date: monday(), end_date: addDays(monday(), 1), vehicle_type: "motorcycle" }), /vehicle_unsupported/);
  });

  it("rejects days/hours outside the listing's availability", async () => {
    const sunday = nextDow(0);
    await expectDbError(createRequest(db, renter, listing, { start_date: sunday, end_date: sunday }), /outside_availability|below_minimum/);
    await expectDbError(createRequest(db, renter, hourly, { start_date: monday(), start_time: "05:00", end_time: "09:00" }), /outside_availability/);
    await expectDbError(createRequest(db, renter, hourly, { start_date: monday(), start_time: "18:00", end_time: "22:00" }), /outside_availability/);
    await expectDbError(createRequest(db, renter, listing, { schedule_type: "recurring", start_date: monday(), end_date: null, recurring_days: [1, 6] }), /outside_availability/);
  });

  it("enforces the listing's minimum duration", async () => {
    await expectDbError(createRequest(db, renter, listing, { start_date: monday(), end_date: monday() }), /below_minimum_duration/);
    await expectDbError(createRequest(db, renter, hourly, { start_date: monday(), start_time: "10:00", end_time: "11:00" }), /below_minimum_duration/);
    await createRequest(db, renter, hourly, { start_date: monday(), start_time: "10:00", end_time: "12:30" });
  });

  it("cannot request drafts, paused or removed listings", async () => {
    const draft = await createDraft(db, owner);
    await expectDbError(createRequest(db, renter, draft, { start_date: monday(), end_date: addDays(monday(), 1) }), /listing_unavailable/);
    const paused = await createPublished(db, owner);
    await setStatus(db, owner, paused, "paused");
    await expectDbError(createRequest(db, renter, paused, { start_date: monday(), end_date: addDays(monday(), 1) }), /listing_unavailable/);
  });

  it("cannot request a suspended listing or a listing of a suspended owner", async () => {
    const l = await createPublished(db, owner, { rental_type: "daily", min_duration: 1 });
    await as(db, service, (tx) => tx.query(`update public.parking_listings set moderation_status = 'suspended' where id = $1`, [l]));
    await expectDbError(createRequest(db, renter, l, { start_date: monday(), end_date: monday() }), /listing_unavailable/);
    const o2 = await createUser(db);
    const l2 = await createPublished(db, o2, { rental_type: "daily", min_duration: 1 });
    await as(db, service, (tx) => tx.query(`update public.profiles set account_status = 'suspended' where id = $1`, [o2]));
    await expectDbError(createRequest(db, renter, l2, { start_date: monday(), end_date: monday() }), /listing_unavailable/);
  });

  it("cannot request demo listings (they have no real owner)", async () => {
    const demoOwner = await createUser(db, { phone: null });
    const demo = await as(db, service, async (tx) => {
      const r = await tx.query<{ id: string }>(
        `insert into public.parking_listings (owner_id, is_demo, title, description, vehicle_types, cover_type, locality, postal_code, rental_type, price_inr, min_duration, available_days, access_24h, owner_declaration, permission_status)
         values ($1, true, 'Demo bay', 'Fictional demo listing, not real inventory.', '{car}', 'open', 'Madhapur', '500081', 'daily', 100, 1, '{0,1,2,3,4,5,6}', true, true, 'not_required') returning id`, [demoOwner]);
      await tx.query(`insert into public.listing_private_details (listing_id, address_line, exact_latitude, exact_longitude) values ($1, 'Demo address, not real', 17.45, 78.39)`, [r.rows[0]!.id]);
      await tx.query(`update public.parking_listings set status = 'published' where id = $1`, [r.rows[0]!.id]);
      return r.rows[0]!.id;
    });
    expect((await as(db, anon, (tx) => tx.query(`select 1 from public.parking_listings where id = $1`, [demo]))).rows).toHaveLength(1);
    await expectDbError(createRequest(db, renter, demo, { start_date: monday(), end_date: monday() }), /demo_listing/);
  });

  it("caps pending requests per user", async () => {
    const spammer = await createUser(db);
    const l = await createPublished(db, owner, { rental_type: "daily", min_duration: 1, available_days: [0, 1, 2, 3, 4, 5, 6] });
    const base = futureDate(2);
    for (let i = 0; i < 20; i++) await createRequest(db, spammer, l, { start_date: addDays(base, i * 2), end_date: addDays(base, i * 2) });
    await expectDbError(createRequest(db, spammer, l, { start_date: addDays(base, 100), end_date: addDays(base, 100) }), /too_many_pending/);
  });
});

describe("booking requests: lifecycle and authorization", () => {
  let db: Db;
  let owner: string;
  let renter: string;
  let stranger: string;
  let listing: string;
  const dayN = (n: number) => addDays(nextDow(1, 3), n * 7);

  beforeAll(async () => {
    db = await createTestDb();
    owner = await createUser(db, { name: "Owner" });
    renter = await createUser(db, { name: "Renter" });
    stranger = await createUser(db, { name: "Stranger" });
    listing = await createPublished(db, owner, { rental_type: "daily", min_duration: 1 });
  });

  it("only the requester and the listing owner can read a request (messages stay private)", async () => {
    const id = await createRequest(db, renter, listing, { start_date: dayN(0), message: "private note" });
    const sees = async (who: string) => (await as(db, asUser(who), (tx) => tx.query(`select message from public.booking_requests where id = $1`, [id]))).rows.length;
    expect(await sees(renter)).toBe(1);
    expect(await sees(owner)).toBe(1);
    expect(await sees(stranger)).toBe(0);
    await expectDbError(as(db, anon, (tx) => tx.query(`select * from public.booking_requests`)), /permission denied/);
  });

  it("owner accepts a pending request and records a response", async () => {
    const id = await createRequest(db, renter, listing, { start_date: dayN(1) });
    expect(await setRequestStatus(db, owner, id, "accepted", "Welcome!")).toBe(1);
    const r = await db.query<{ status: string; owner_response: string; responded_at: string | null }>(`select status, owner_response, responded_at from public.booking_requests where id = $1`, [id]);
    expect(r.rows[0]!.status).toBe("accepted");
    expect(r.rows[0]!.owner_response).toBe("Welcome!");
    expect(r.rows[0]!.responded_at).not.toBeNull();
  });

  it("owner can decline; declined is terminal", async () => {
    const id = await createRequest(db, renter, listing, { start_date: dayN(2) });
    expect(await setRequestStatus(db, owner, id, "declined", "Not available")).toBe(1);
    await expectDbError(setRequestStatus(db, owner, id, "accepted"), /invalid_status_transition/);
    await expectDbError(setRequestStatus(db, renter, id, "cancelled"), /invalid_status_transition/);
  });

  it("the requester cannot accept/decline/complete their own request", async () => {
    const id = await createRequest(db, renter, listing, { start_date: dayN(3) });
    for (const s of ["accepted", "declined", "completed"]) {
      await expectDbError(setRequestStatus(db, renter, id, s), /invalid_status_transition/);
    }
  });

  it("the requester can cancel pending and accepted requests (and the slot is freed)", async () => {
    const a = await createRequest(db, renter, listing, { start_date: dayN(4) });
    expect(await setRequestStatus(db, renter, a, "cancelled")).toBe(1);
    const b = await createRequest(db, renter, listing, { start_date: dayN(5) });
    await setRequestStatus(db, owner, b, "accepted");
    expect(await setRequestStatus(db, renter, b, "cancelled")).toBe(1);
    const again = await createRequest(db, stranger, listing, { start_date: dayN(5) }); // slot free again
    expect(again).toBeTruthy();
  });

  it("strangers cannot change a request (0 rows) and cannot see it", async () => {
    const id = await createRequest(db, renter, listing, { start_date: dayN(6) });
    expect(await setRequestStatus(db, stranger, id, "cancelled")).toBe(0);
    expect(await setRequestStatus(db, stranger, id, "accepted")).toBe(0);
    const still = await db.query<{ status: string }>(`select status from public.booking_requests where id = $1`, [id]);
    expect(still.rows[0]!.status).toBe("pending");
  });

  it("request details are immutable after creation (dates, message, requester, listing)", async () => {
    const id = await createRequest(db, renter, listing, { start_date: dayN(7) });
    for (const col of ["message = 'edited'", "start_date = start_date + 1", `requester_id = '${stranger}'`, `listing_id = '${listing}'`, "vehicle_type = 'other'"]) {
      await expectDbError(as(db, asUser(renter), (tx) => tx.query(`update public.booking_requests set ${col} where id = $1`, [id])), /permission denied/);
      await expectDbError(as(db, asUser(owner), (tx) => tx.query(`update public.booking_requests set ${col} where id = $1`, [id])), /permission denied/);
    }
  });

  it("the requester cannot write an owner response", async () => {
    const id = await createRequest(db, renter, listing, { start_date: dayN(8) });
    await expectDbError(as(db, asUser(renter), (tx) => tx.query(`update public.booking_requests set owner_response = 'I approve myself' where id = $1`, [id])), /forbidden/);
  });

  it("nobody can delete requests through the API", async () => {
    const id = await createRequest(db, renter, listing, { start_date: dayN(9) });
    await expectDbError(as(db, asUser(renter), (tx) => tx.query(`delete from public.booking_requests where id = $1`, [id])), /permission denied/);
  });

  it("completion is only possible once the rental has started", async () => {
    const future = await createRequest(db, renter, listing, { start_date: dayN(10) });
    await setRequestStatus(db, owner, future, "accepted");
    await expectDbError(setRequestStatus(db, owner, future, "completed"), /cannot_complete_before_start/);
    // Simulate a started rental by back-dating through the service role (the API cannot do this).
    await as(db, service, (tx) => tx.query(`update public.booking_requests set start_date = public.ist_today() - 1, end_date = public.ist_today() where id = $1`, [future]));
    expect(await setRequestStatus(db, owner, future, "completed")).toBe(1);
  });

  it("dashboards: list_my_requests / list_incoming_requests are scoped to the caller and hide contact data", async () => {
    const mine = await as(db, asUser(renter), (tx) => tx.query<Record<string, unknown>>(`select * from public.list_my_requests()`));
    expect(mine.rows.length).toBeGreaterThan(0);
    expect(mine.rows.every((r) => r.listing_id === listing)).toBe(true);
    expect(Object.keys(mine.rows[0]!)).not.toContain("requester_id");
    const bystander = await createUser(db);
    const none = await as(db, asUser(bystander), (tx) => tx.query(`select * from public.list_my_requests()`));
    expect(none.rows).toHaveLength(0);
    const incoming = await as(db, asUser(owner), (tx) => tx.query<{ other_party_name: string }>(`select * from public.list_incoming_requests()`));
    expect(incoming.rows.length).toBeGreaterThan(0);
    expect(incoming.rows[0]!.other_party_name).toBe("Renter");
    expect((await as(db, asUser(renter), (tx) => tx.query(`select * from public.list_incoming_requests()`))).rows).toHaveLength(0);
    await expectDbError(as(db, anon, (tx) => tx.query(`select * from public.list_my_requests()`)), /permission denied/);
  });
});

describe("booking requests: overlapping requests", () => {
  let db: Db;
  let owner: string;
  let a: string;
  let b: string;
  let listing: string;
  let hourly: string;
  const base = () => nextDow(1, 5);

  beforeAll(async () => {
    db = await createTestDb();
    owner = await createUser(db);
    a = await createUser(db);
    b = await createUser(db);
    listing = await createPublished(db, owner, { rental_type: "daily", min_duration: 1, available_days: [0, 1, 2, 3, 4, 5, 6], access_24h: true, available_from: null, available_to: null });
    hourly = await createPublished(db, owner, { rental_type: "hourly", min_duration: 1, price_inr: 50, available_days: [0, 1, 2, 3, 4, 5, 6], available_from: "06:00", available_to: "22:00" });
  });

  it("overlapping PENDING requests from different users are allowed; the owner decides", async () => {
    const r1 = await createRequest(db, a, listing, { start_date: base(), end_date: addDays(base(), 3) });
    const r2 = await createRequest(db, b, listing, { start_date: addDays(base(), 2), end_date: addDays(base(), 5) });
    expect(r1).not.toBe(r2);
  });

  it("accepting a request blocks accepting a conflicting one", async () => {
    const s = addDays(base(), 14);
    const r1 = await createRequest(db, a, listing, { start_date: s, end_date: addDays(s, 3) });
    const r2 = await createRequest(db, b, listing, { start_date: addDays(s, 2), end_date: addDays(s, 5) });
    await setRequestStatus(db, owner, r1, "accepted");
    await expectDbError(setRequestStatus(db, owner, r2, "accepted"), /slot_taken/);
    const st = await db.query<{ status: string }>(`select status from public.booking_requests where id = $1`, [r2]);
    expect(st.rows[0]!.status).toBe("pending");
  });

  it("new requests that overlap an ACCEPTED request are rejected immediately", async () => {
    const s = addDays(base(), 28);
    const r1 = await createRequest(db, a, listing, { start_date: s, end_date: addDays(s, 3) });
    await setRequestStatus(db, owner, r1, "accepted");
    await expectDbError(createRequest(db, b, listing, { start_date: addDays(s, 3), end_date: addDays(s, 4) }), /slot_taken/);
    // Adjacent, non-overlapping dates are fine.
    await createRequest(db, b, listing, { start_date: addDays(s, 4), end_date: addDays(s, 5) });
  });

  it("the same user cannot open duplicate overlapping requests on a listing", async () => {
    const s = addDays(base(), 42);
    await createRequest(db, a, listing, { start_date: s, end_date: addDays(s, 2) });
    await expectDbError(createRequest(db, a, listing, { start_date: addDays(s, 1), end_date: addDays(s, 3) }), /duplicate_request/);
  });

  it("hourly requests on the same day only conflict when the time windows overlap", async () => {
    const day = addDays(base(), 7);
    const r1 = await createRequest(db, a, hourly, { start_date: day, start_time: "09:00", end_time: "12:00" });
    await setRequestStatus(db, owner, r1, "accepted");
    await expectDbError(createRequest(db, b, hourly, { start_date: day, start_time: "11:00", end_time: "13:00" }), /slot_taken/);
    await createRequest(db, b, hourly, { start_date: day, start_time: "12:00", end_time: "14:00" }); // touching, not overlapping
  });

  it("recurring schedules conflict only on shared weekdays", async () => {
    const day = addDays(base(), 56); // a Monday
    const weekdays = await createRequest(db, a, listing, { schedule_type: "recurring", start_date: day, end_date: addDays(day, 60), end_time: null, recurring_days: [1, 2, 3] });
    await setRequestStatus(db, owner, weekdays, "accepted");
    await expectDbError(createRequest(db, b, listing, { schedule_type: "recurring", start_date: day, end_date: addDays(day, 60), recurring_days: [3, 4] }), /slot_taken/);
    await createRequest(db, b, listing, { schedule_type: "recurring", start_date: day, end_date: addDays(day, 60), recurring_days: [5, 6] });
    // A one-time request on a free weekday inside the recurring range is fine; on a booked weekday it is not.
    await createRequest(db, b, listing, { start_date: addDays(day, 3), end_date: addDays(day, 3) }); // Thursday
    await expectDbError(createRequest(db, b, listing, { start_date: addDays(day, 8), end_date: addDays(day, 8) }), /slot_taken/); // Tuesday
  });

  it("an expired pending request cannot be accepted", async () => {
    const s = addDays(base(), 90);
    const r = await createRequest(db, a, listing, { start_date: s, end_date: s });
    await as(db, service, (tx) => tx.query(`update public.booking_requests set start_date = public.ist_today() - 5, end_date = public.ist_today() - 4 where id = $1`, [r]));
    await expectDbError(setRequestStatus(db, owner, r, "accepted"), /request_expired/);
  });

  it("owner cannot accept after the listing is paused", async () => {
    const l = await createPublished(db, owner, { rental_type: "daily", min_duration: 1, available_days: [0, 1, 2, 3, 4, 5, 6], access_24h: true });
    const r = await createRequest(db, a, l, { start_date: base() });
    await setStatus(db, owner, l, "paused");
    await expectDbError(setRequestStatus(db, owner, r, "accepted"), /listing_unavailable/);
  });
});

describe("private access details", () => {
  let db: Db;
  let owner: string;
  let renter: string;
  let stranger: string;
  let listing: string;
  beforeAll(async () => {
    db = await createTestDb();
    owner = await createUser(db);
    renter = await createUser(db);
    stranger = await createUser(db);
    listing = await createPublished(db, owner, { rental_type: "daily", min_duration: 1 }, { address_line: "Fictional Heights, Block C", access_instructions: "Gate code 4242 (fictional)" });
  });

  const access = (who: string, req: string) => as(db, asUser(who), (tx) => tx.query<{ address_line: string; access_instructions: string }>(`select * from public.get_booked_listing_access($1)`, [req]));

  it("is withheld from pending requesters and strangers, released to the requester once accepted, and revoked after cancellation", async () => {
    const req = await createRequest(db, renter, listing, { start_date: nextDow(1, 3), end_date: nextDow(1, 3) });
    expect((await access(renter, req)).rows).toHaveLength(0); // pending
    await setRequestStatus(db, owner, req, "accepted");
    const ok = await access(renter, req);
    expect(ok.rows[0]!.address_line).toBe("Fictional Heights, Block C");
    expect(ok.rows[0]!.access_instructions).toContain("4242");
    expect((await access(stranger, req)).rows).toHaveLength(0);
    await setRequestStatus(db, renter, req, "cancelled");
    expect((await access(renter, req)).rows).toHaveLength(0);
    await expectDbError(as(db, anon, (tx) => tx.query(`select * from public.get_booked_listing_access($1)`, [req])), /permission denied/);
  });

  it("the requester can never read the private table directly", async () => {
    const r = await as(db, asUser(renter), (tx) => tx.query(`select * from public.listing_private_details`));
    expect(r.rows).toHaveLength(0);
  });
});
