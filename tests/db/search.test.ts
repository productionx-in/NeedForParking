import { describe, it, expect, beforeAll } from "vitest";
import { createTestDb, createUser, createPublished, createDraft, setStatus, as, anon, asUser, type Db } from "./helpers";

type Row = {
  id: string; title: string; locality: string; price_inr: string; rental_type: string; cover_type: string;
  vehicle_types: string[]; is_open_now: boolean; distance_km: number | null; total_count: string | number;
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
    const near = await search({ ...hitec, p_radius_km: 3, p_sort: "distance" });
    expect(near.length).toBeGreaterThanOrEqual(2);
    expect(near.every((r) => r.distance_km! <= 3)).toBe(true);
    const sorted = near.map((r) => r.distance_km!);
    expect(sorted).toEqual([...sorted].sort((a, b) => a - b));
    expect(titles(near)).not.toContain("Listing ameerpet-car-open-monthly"); // ~7 km away
    const far = await search({ ...hitec, p_radius_km: 15 });
    expect(far).toHaveLength(5);
    const nearest = await search({ ...hitec, p_sort: "distance" });
    expect(nearest[0]!.distance_km!).toBeLessThan(nearest[nearest.length - 1]!.distance_km!);
  });

  it("distance is computed from PUBLIC (snapped) coordinates, never the exact pin", async () => {
    const rows = await search({ p_lat: 17.4486, p_lng: 78.3908, p_sort: "distance" });
    const mad = rows.find((r) => r.title === "Listing madhapur-car-covered-monthly")!;
    expect(mad.latitude).not.toBe(17.4486);
    // Exact pin is at distance 0 from the query point; reported distance must not reveal that.
    expect(mad.distance_km!).toBeGreaterThan(0);
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
