import { describe, it, expect, beforeAll } from "vitest";
import { createTestDb, createUser, createPublished, createDraft, setStatus, as, anon, asUser, type Db } from "./helpers";

type Row = {
  id: string; title: string; locality: string; price_inr: string; rental_type: string; cover_type: string;
  vehicle_types: string[]; is_open_now: boolean; distance_m: number | null; total_count: string | number;
  latitude: number; longitude: number; cover_photo_path: string | null;
};

describe("search_listings: filters operate on real database rows", () => {
  let db: Db;
  const ids: Record<string, string> = {};
  let owner: string;

  const search = async (args: Record<string, unknown> = {}, who: "anon" | string = "anon") => {
    const keys = Object.keys(args);
    const sql = `select * from public.search_listings(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")})`;
    const params = keys.map((k) => args[k]);
    const actor = who === "anon" ? anon : asUser(who);
    return (await as(db, actor, (tx) => tx.query<Row>(sql, params))).rows;
  };
  const titles = (rows: Row[]) => rows.map((r) => r.title).sort();

  beforeAll(async () => {
    db = await createTestDb();
    owner = await createUser(db);
    const all = [0, 1, 2, 3, 4, 5, 6];
    const mk = async (key: string, o: Record<string, unknown>, priv?: { exact_latitude: number; exact_longitude: number }) => {
      ids[key] = await createPublished(db, owner, { title: `Listing ${key}`, available_days: all, available_from: null, available_to: null, access_24h: true, ...o }, priv ?? {});
    };
    await mk("madhapur-car-covered-monthly", { locality: "Madhapur", vehicle_types: ["car"], cover_type: "covered", rental_type: "monthly", price_inr: 4000 }, { exact_latitude: 17.4486, exact_longitude: 78.3908 });
    await mk("kondapur-bike-open-daily", { locality: "Kondapur", vehicle_types: ["motorcycle"], cover_type: "open", rental_type: "daily", price_inr: 80, overnight_allowed: true }, { exact_latitude: 17.46, exact_longitude: 78.365 });
    await mk("gachibowli-both-covered-hourly", { locality: "Gachibowli", vehicle_types: ["car", "motorcycle"], cover_type: "covered", rental_type: "hourly", price_inr: 40 }, { exact_latitude: 17.4401, exact_longitude: 78.3489 });
    await mk("ameerpet-car-open-monthly", { locality: "Ameerpet", vehicle_types: ["car"], cover_type: "open", rental_type: "monthly", price_inr: 2500, access_24h: false, available_from: "09:00", available_to: "18:00", available_days: [1, 2, 3, 4, 5] }, { exact_latitude: 17.4375, exact_longitude: 78.4483 });
    await mk("weird_%name", { locality: "Madhapur", vehicle_types: ["other"], cover_type: "open", rental_type: "daily", price_inr: 150 }, { exact_latitude: 17.449, exact_longitude: 78.392 });
    // Non-public listings must never be returned.
    ids.draft = await createDraft(db, owner, { title: "Listing draft" });
    ids.paused = await createPublished(db, owner, { title: "Listing paused" });
    await setStatus(db, owner, ids.paused, "paused");
    ids.suspended = await createPublished(db, owner, { title: "Listing suspended" });
    await db.query(`update public.parking_listings set moderation_status = 'suspended' where id = $1`, [ids.suspended]);
  });

  it("returns only published, unsuspended listings — for visitors and for the owner alike", async () => {
    const rows = await search({ p_limit: 100 });
    expect(rows).toHaveLength(5);
    expect(titles(rows)).not.toContain("Listing draft");
    expect(titles(await search({ p_limit: 100 }, owner))).toEqual(titles(rows));
  });

  it("includes a cover photo and total_count for pagination", async () => {
    const rows = await search({ p_limit: 2, p_offset: 0 });
    expect(rows).toHaveLength(2);
    expect(Number(rows[0]!.total_count)).toBe(5);
    expect(rows[0]!.cover_photo_path).toMatch(/\.jpg$/);
    const page2 = await search({ p_limit: 2, p_offset: 2 });
    const page3 = await search({ p_limit: 2, p_offset: 4 });
    expect(page3).toHaveLength(1);
    const seen = new Set([...rows, ...page2, ...page3].map((r) => r.id));
    expect(seen.size).toBe(5);
  });

  it("clamps absurd limits and negative offsets", async () => {
    expect((await search({ p_limit: 100000, p_offset: -5 })).length).toBeLessThanOrEqual(100);
    expect((await search({ p_limit: 0 })).length).toBe(1);
  });

  it("filters by vehicle type", async () => {
    expect(titles(await search({ p_vehicle: "motorcycle" }))).toEqual(["Listing gachibowli-both-covered-hourly", "Listing kondapur-bike-open-daily"]);
    expect(titles(await search({ p_vehicle: "other" }))).toEqual(["Listing weird_%name"]);
  });

  it("filters by price range", async () => {
    expect(titles(await search({ p_min_price: 1000 }))).toEqual(["Listing ameerpet-car-open-monthly", "Listing madhapur-car-covered-monthly"]);
    expect(titles(await search({ p_max_price: 100 }))).toEqual(["Listing gachibowli-both-covered-hourly", "Listing kondapur-bike-open-daily"]);
    expect(titles(await search({ p_min_price: 100, p_max_price: 3000 }))).toEqual(["Listing ameerpet-car-open-monthly", "Listing weird_%name"]);
  });

  it("filters by rental type and covered/open", async () => {
    expect(titles(await search({ p_rental_type: "monthly" }))).toHaveLength(2);
    expect(titles(await search({ p_rental_type: "hourly" }))).toEqual(["Listing gachibowli-both-covered-hourly"]);
    expect(titles(await search({ p_cover_type: "covered" }))).toHaveLength(2);
    expect(titles(await search({ p_cover_type: "open", p_rental_type: "daily" }))).toHaveLength(2);
  });

  it("searches locality and title case-insensitively and treats wildcards literally", async () => {
    expect(titles(await search({ p_query: "madhapur" }))).toHaveLength(2);
    expect(titles(await search({ p_query: "KONDA" }))).toEqual(["Listing kondapur-bike-open-daily"]);
    expect(titles(await search({ p_query: "bowli-both" }))).toEqual(["Listing gachibowli-both-covered-hourly"]);
    expect(titles(await search({ p_query: "%" }))).toEqual(["Listing weird_%name"]);
    expect(titles(await search({ p_query: "_" }))).toEqual(["Listing weird_%name"]);
    expect(await search({ p_query: "nowhere-land" })).toHaveLength(0);
    expect(titles(await search({ p_locality: "ameerpet" }))).toEqual(["Listing ameerpet-car-open-monthly"]);
  });

  it("does not allow SQL injection through text filters", async () => {
    expect(await search({ p_query: "'; drop table public.parking_listings; --" })).toHaveLength(0);
    expect((await search({ p_limit: 100 })).length).toBe(5);
  });

  it("filters by overnight and 24-hour access", async () => {
    expect(titles(await search({ p_overnight: true }))).toEqual(["Listing kondapur-bike-open-daily"]);
    expect(await search({ p_access_24h: true })).toHaveLength(4);
  });

  it("filters by available weekday and 'open now' (IST)", async () => {
    expect(titles(await search({ p_day: 0 }))).not.toContain("Listing ameerpet-car-open-monthly"); // weekdays only
    expect(titles(await search({ p_day: 3 }))).toContain("Listing ameerpet-car-open-monthly");
    const open = await search({ p_open_now: true, p_limit: 100 });
    // 24h listings are always open; the 09-18 weekday listing is open only when IST matches.
    expect(open.length).toBeGreaterThanOrEqual(4);
    const ist = new Date(Date.now() + 5.5 * 3600_000);
    const dow = ist.getUTCDay();
    const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    const shouldBeOpen = dow >= 1 && dow <= 5 && mins >= 9 * 60 && mins < 18 * 60;
    expect(open.some((r) => r.title === "Listing ameerpet-car-open-monthly")).toBe(shouldBeOpen);
  });

  it("computes distance from destination coordinates, filters by radius and sorts by distance", async () => {
    const hitec = { p_lat: 17.4435, p_lng: 78.3772 };
    const near = await search({ ...hitec, p_radius_m: 3000, p_sort: "distance" });
    expect(near.length).toBeGreaterThanOrEqual(2);
    expect(near.every((r) => r.distance_m! <= 3000 + 110)).toBe(true); // approximate pins get ~110 m tolerance
    const sorted = near.map((r) => r.distance_m!);
    expect(sorted).toEqual([...sorted].sort((a, b) => a - b));
    expect(titles(near)).not.toContain("Listing ameerpet-car-open-monthly"); // ~7 km away
    const far = await search({ ...hitec, p_radius_m: 15000 });
    expect(far).toHaveLength(5);
    const nearest = await search({ ...hitec, p_sort: "distance" });
    expect(nearest[0]!.distance_m!).toBeLessThan(nearest[nearest.length - 1]!.distance_m!);
  });

  it("distance is computed from PUBLIC (snapped) coordinates, never the exact pin", async () => {
    const rows = await search({ p_lat: 17.4486, p_lng: 78.3908, p_sort: "distance" });
    const mad = rows.find((r) => r.title === "Listing madhapur-car-covered-monthly")!;
    expect(mad.latitude).not.toBe(17.4486);
    // Exact pin is at distance 0 from the query point; reported distance must not reveal that.
    expect(mad.distance_m!).toBeGreaterThan(0);
  });

  it("sorts by price", async () => {
    const asc = (await search({ p_sort: "price_asc" })).map((r) => Number(r.price_inr));
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
    const desc = (await search({ p_sort: "price_desc" })).map((r) => Number(r.price_inr));
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
  });

  it("combines filters", async () => {
    const rows = await search({ p_vehicle: "car", p_cover_type: "covered", p_rental_type: "monthly", p_max_price: 5000, p_query: "madhapur" });
    expect(titles(rows)).toEqual(["Listing madhapur-car-covered-monthly"]);
  });
});


describe("walking-distance search (metres)", () => {
  let db: Db;
  let owner: string;
  const ids: Record<string, string> = {};
  const DEST = { lat: 17.44, lng: 78.35 };
  const M_PER_DEG_LAT = 111_195;
  const northOf = (metres: number) => DEST.lat + metres / M_PER_DEG_LAT;

  const search = async (args: Record<string, unknown>) => {
    const keys = Object.keys(args);
    const sql = `select * from public.search_listings(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")})`;
    return (await as(db, anon, (tx) => tx.query<Row>(sql, keys.map((k) => args[k])))).rows;
  };
  const near = async (radiusM: number) =>
    (await search({ p_lat: DEST.lat, p_lng: DEST.lng, p_radius_m: radiusM, p_sort: "distance", p_limit: 100 })).map((r) => r.title);

  beforeAll(async () => {
    db = await createTestDb();
    owner = await createUser(db);
    const base = { available_days: [0, 1, 2, 3, 4, 5, 6], available_from: null, available_to: null, access_24h: true };
    // Exact-pin listings at known distances (public point == real point, so distances are exact).
    for (const m of [50, 150, 250, 400, 900]) {
      await createPublished(db, owner, { title: `Exact ${m}m`, location_privacy: "exact", ...base }, { exact_latitude: northOf(m), exact_longitude: DEST.lng });
    }
    // Approximate listing: its public pin is the centre of a ~220 m cell, so the real spot may be up to ~150 m away from it.
    await createPublished(db, owner, { title: "Approx", location_privacy: "approximate", ...base }, { exact_latitude: northOf(230), exact_longitude: DEST.lng + 0.0003 });
    ids.approx = (await db.query<{ id: string }>(`select id from public.parking_listings where title = 'Approx'`)).rows[0]!.id;
  });

  it("filters by walking distance in metres around an exact destination", async () => {
    expect(await near(100)).toEqual(["Exact 50m"]);
    expect(await near(200)).toEqual(["Exact 50m", "Exact 150m"]);
    expect(await near(300)).toEqual(expect.arrayContaining(["Exact 50m", "Exact 150m", "Exact 250m"]));
    expect(await near(300)).not.toContain("Exact 400m");
    expect(await near(500)).toEqual(expect.arrayContaining(["Exact 400m"]));
    expect(await near(500)).not.toContain("Exact 900m");
    expect(await near(1000)).toContain("Exact 900m");
  });

  it("returns distance in metres, nearest first", async () => {
    const rows = await search({ p_lat: DEST.lat, p_lng: DEST.lng, p_radius_m: 1000, p_sort: "distance" });
    const d = rows.map((r) => r.distance_m!);
    expect(d).toEqual([...d].sort((a, b) => a - b));
    expect(rows.find((r) => r.title === "Exact 150m")!.distance_m!).toBeCloseTo(150, -1);
  });

  it("gives approximate listings ~110 m of tolerance, because their public pin is rounded", async () => {
    const pub = await db.query<{ latitude: number; longitude: number }>(`select latitude, longitude from public.parking_listings where id = $1`, [ids.approx]);
    const dPub = (await search({ p_lat: DEST.lat, p_lng: DEST.lng, p_radius_m: 5000 })).find((r) => r.title === "Approx")!.distance_m!;
    expect(dPub).toBeGreaterThan(120); // sanity: the geometry gives a usable gap
    expect(pub.rows[0]!.latitude).not.toBeCloseTo(northOf(230), 5); // really snapped
    // within the tolerance band -> still found; beyond it -> not
    expect(await near(Math.floor(dPub - 80))).toContain("Approx");
    expect(await near(Math.floor(dPub - 140))).not.toContain("Approx");
  });

  it("cannot be used to triangulate: distances are measured to the public point, never the exact pin", async () => {
    // Query from the exact pin of the approximate listing: the reported distance must NOT be ~0.
    const rows = await search({ p_lat: northOf(230), p_lng: DEST.lng + 0.0003, p_radius_m: 1000 });
    const d = rows.find((r) => r.title === "Approx")!.distance_m!;
    expect(d).toBeGreaterThan(5);
  });
});
