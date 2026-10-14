import { describe, it, expect, beforeAll } from "vitest";
import { createTestDb, type Db } from "./helpers";

describe("migrations", () => {
  let db: Db;
  beforeAll(async () => {
    db = await createTestDb();
  });

  it("apply cleanly and create all required tables with RLS enabled", async () => {
    const res = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' order by 1`,
    );
    const names = res.rows.map((r) => r.relname);
    for (const t of ["profiles", "parking_listings", "listing_private_details", "listing_photos", "booking_requests", "favorites", "reports", "admin_audit_log"]) {
      expect(names).toContain(t);
    }
    expect(res.rows.filter((r) => !r.relrowsecurity)).toEqual([]);
  });
});
