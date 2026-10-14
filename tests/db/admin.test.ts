import { describe, it, expect, beforeAll } from "vitest";
import {
  createTestDb, createUser, createPublished, createDraft, createRequest, as, asUser, anon, service, expectDbError,
  nextDow, type Db,
} from "./helpers";

describe("reports & admin moderation", () => {
  let db: Db;
  let admin: string;
  let owner: string;
  let reporter: string;
  let bystander: string;
  let listing: string;

  beforeAll(async () => {
    db = await createTestDb();
    admin = await createUser(db, { admin: true, name: "Admin" });
    owner = await createUser(db, { name: "Owner" });
    reporter = await createUser(db, { name: "Reporter" });
    bystander = await createUser(db, { name: "Bystander" });
    listing = await createPublished(db, owner, { rental_type: "daily", min_duration: 1 });
  });

  const publicCount = async (id: string) =>
    (await as(db, anon, (tx) => tx.query(`select 1 from public.parking_listings where id = $1`, [id]))).rows.length;

  describe("reports", () => {
    it("a verified user can report a public listing; the reporter and admins can read it, others cannot", async () => {
      await as(db, asUser(reporter), (tx) => tx.query(`insert into public.reports (listing_id, reporter_id, reason, details) values ($1, $2, 'scam', 'Looks fake')`, [listing, reporter]));
      expect((await as(db, asUser(reporter), (tx) => tx.query(`select * from public.reports`))).rows).toHaveLength(1);
      expect((await as(db, asUser(admin), (tx) => tx.query(`select * from public.reports`))).rows.length).toBeGreaterThan(0);
      expect((await as(db, asUser(bystander), (tx) => tx.query(`select * from public.reports`))).rows).toHaveLength(0);
      expect((await as(db, asUser(owner), (tx) => tx.query(`select * from public.reports`))).rows).toHaveLength(0);
    });

    it("duplicate open reports, self-reports, drafts and impersonated reporters are rejected", async () => {
      await expectDbError(as(db, asUser(reporter), (tx) => tx.query(`insert into public.reports (listing_id, reporter_id, reason) values ($1, $2, 'scam')`, [listing, reporter])), /duplicate key/);
      await expectDbError(as(db, asUser(owner), (tx) => tx.query(`insert into public.reports (listing_id, reporter_id, reason) values ($1, $2, 'other')`, [listing, owner])), /own_listing/);
      const draft = await createDraft(db, owner);
      await expectDbError(as(db, asUser(bystander), (tx) => tx.query(`insert into public.reports (listing_id, reporter_id, reason) values ($1, $2, 'other')`, [draft, bystander])), /row-level security/);
      await expectDbError(as(db, asUser(bystander), (tx) => tx.query(`insert into public.reports (listing_id, reporter_id, reason) values ($1, $2, 'other')`, [listing, reporter])), /row-level security/);
      await expectDbError(as(db, anon, (tx) => tx.query(`insert into public.reports (listing_id, reporter_id, reason) values ($1, $2, 'other')`, [listing, reporter])), /permission denied/);
    });

    it("reporters cannot self-resolve or alter reports", async () => {
      await expectDbError(as(db, asUser(reporter), (tx) => tx.query(`update public.reports set status = 'dismissed'`)), /permission denied/);
      await expectDbError(as(db, asUser(reporter), (tx) => tx.query(`delete from public.reports`)), /permission denied/);
    });

    it("report status cannot be pre-set on insert", async () => {
      const l2 = await createPublished(db, owner);
      await expectDbError(as(db, asUser(bystander), (tx) => tx.query(`insert into public.reports (listing_id, reporter_id, reason, status) values ($1, $2, 'other', 'dismissed')`, [l2, bystander])), /permission denied/);
    });

    it("rate-limits reporters to 10 per day", async () => {
      const spammer = await createUser(db);
      for (let i = 0; i < 10; i++) {
        const l = await createPublished(db, owner);
        await as(db, asUser(spammer), (tx) => tx.query(`insert into public.reports (listing_id, reporter_id, reason) values ($1, $2, 'other')`, [l, spammer]));
      }
      const l = await createPublished(db, owner);
      await expectDbError(as(db, asUser(spammer), (tx) => tx.query(`insert into public.reports (listing_id, reporter_id, reason) values ($1, $2, 'other')`, [l, spammer])), /report_rate_limited/);
    });
  });

  describe("admin-only operations", () => {
    it("non-admins cannot call any admin RPC (even with a valid session)", async () => {
      for (const who of [owner, reporter]) {
        await expectDbError(as(db, asUser(who), (tx) => tx.query(`select public.admin_set_listing_moderation($1, 'suspended', 'x')`, [listing])), /forbidden/);
        await expectDbError(as(db, asUser(who), (tx) => tx.query(`select public.admin_set_account_status($1, 'suspended', 'x')`, [owner])), /forbidden/);
        await expectDbError(as(db, asUser(who), (tx) => tx.query(`select public.admin_resolve_report(gen_random_uuid(), 'dismissed', 'x')`)), /forbidden/);
      }
      expect(await publicCount(listing)).toBe(1);
    });

    it("anonymous callers cannot execute admin RPCs", async () => {
      await expectDbError(as(db, anon, (tx) => tx.query(`select public.admin_set_listing_moderation($1, 'suspended', 'x')`, [listing])), /permission denied/);
    });

    it("non-admins cannot read the audit log or other users' profiles", async () => {
      expect((await as(db, asUser(owner), (tx) => tx.query(`select * from public.admin_audit_log`))).rows).toHaveLength(0);
      expect((await as(db, asUser(owner), (tx) => tx.query(`select * from public.profiles where id = $1`, [reporter]))).rows).toHaveLength(0);
      expect((await as(db, asUser(admin), (tx) => tx.query(`select * from public.profiles where id = $1`, [reporter]))).rows).toHaveLength(1);
    });

    it("a suspended admin loses admin powers", async () => {
      const ex = await createUser(db, { admin: true, suspended: true });
      await expectDbError(as(db, asUser(ex), (tx) => tx.query(`select public.admin_set_listing_moderation($1, 'suspended', 'x')`, [listing])), /forbidden/);
    });

    it("an admin can suspend a listing: it disappears publicly, stays visible to its owner, and the owner cannot undo it", async () => {
      await as(db, asUser(admin), (tx) => tx.query(`select public.admin_set_listing_moderation($1, 'suspended', 'Reported as a scam')`, [listing]));
      expect(await publicCount(listing)).toBe(0);
      const own = await as(db, asUser(owner), (tx) => tx.query<{ moderation_status: string }>(`select moderation_status from public.parking_listings where id = $1`, [listing]));
      expect(own.rows[0]!.moderation_status).toBe("suspended");
      await expectDbError(as(db, asUser(owner), (tx) => tx.query(`update public.parking_listings set moderation_status = 'ok' where id = $1`, [listing])), /permission denied/);
      const search = await as(db, anon, (tx) => tx.query(`select * from public.search_listings()`));
      expect(search.rows.find((r) => (r as { id: string }).id === listing)).toBeUndefined();
      // Cannot be favorited/reported/requested while suspended.
      await expectDbError(createRequest(db, bystander, listing, { start_date: nextDow(1) }), /listing_unavailable/);
      await as(db, asUser(admin), (tx) => tx.query(`select public.admin_set_listing_moderation($1, 'ok', 'Cleared')`, [listing]));
      expect(await publicCount(listing)).toBe(1);
    });

    it("an admin can resolve a report; resolving is audited and one-way", async () => {
      const rep = await db.query<{ id: string }>(`select id from public.reports where reporter_id = $1 and listing_id = $2`, [reporter, listing]);
      const id = rep.rows[0]!.id;
      await as(db, asUser(admin), (tx) => tx.query(`select public.admin_resolve_report($1, 'actioned', 'Listing suspended then cleared')`, [id]));
      const r = await db.query<{ status: string; reviewed_by: string }>(`select status, reviewed_by from public.reports where id = $1`, [id]);
      expect(r.rows[0]).toEqual({ status: "actioned", reviewed_by: admin });
      await expectDbError(as(db, asUser(admin), (tx) => tx.query(`select public.admin_resolve_report($1, 'dismissed', 'again')`, [id])), /not_found_or_closed/);
      const audit = await as(db, asUser(admin), (tx) => tx.query<{ action: string }>(`select action from public.admin_audit_log order by created_at`));
      expect(audit.rows.map((a) => a.action)).toEqual(expect.arrayContaining(["listing_suspended", "listing_ok", "report_actioned"]));
    });

    it("invalid moderation values are rejected", async () => {
      await expectDbError(as(db, asUser(admin), (tx) => tx.query(`select public.admin_set_listing_moderation($1, 'banana')`, [listing])), /invalid_status/);
    });

    it("suspending an account hides the owner's listings and blocks them from transacting", async () => {
      const bad = await createUser(db, { name: "Bad Actor" });
      const badListing = await createPublished(db, bad);
      expect(await publicCount(badListing)).toBe(1);
      await as(db, asUser(admin), (tx) => tx.query(`select public.admin_set_account_status($1, 'suspended', 'Repeated scams')`, [bad]));
      expect(await publicCount(badListing)).toBe(0);
      const prof = await db.query<{ account_status: string; suspension_reason: string }>(`select account_status, suspension_reason from public.profiles where id = $1`, [bad]);
      expect(prof.rows[0]).toEqual({ account_status: "suspended", suspension_reason: "Repeated scams" });
      await expectDbError(createDraft(db, bad), /row-level security/);
      const upd = await as(db, asUser(bad), (tx) => tx.query(`update public.parking_listings set title = 'Still here' where id = $1`, [badListing]));
      expect(upd.affectedRows).toBe(0);
      expect(await as(db, asUser(bad), (tx) => tx.query(`update public.profiles set display_name = 'x' where id = $1`, [bad])).then((r) => r.affectedRows)).toBe(0);
      await expectDbError(as(db, asUser(bad), (tx) => tx.query(`update public.profiles set account_status = 'active' where id = $1`, [bad])), /permission denied/);
      await expect(as(db, asUser(bad), (tx) => tx.query(`select 1 from public.get_public_owner($1)`, [bad])).then((r) => r.rows.length)).resolves.toBe(0);
      // lifted
      await as(db, asUser(admin), (tx) => tx.query(`select public.admin_set_account_status($1, 'active')`, [bad]));
      expect(await publicCount(badListing)).toBe(1);
    });

    it("an admin cannot suspend themselves or other admins", async () => {
      const other = await createUser(db, { admin: true });
      await expectDbError(as(db, asUser(admin), (tx) => tx.query(`select public.admin_set_account_status($1, 'suspended')`, [admin])), /cannot_modify_self/);
      await expectDbError(as(db, asUser(admin), (tx) => tx.query(`select public.admin_set_account_status($1, 'suspended')`, [other])), /cannot_modify_admin/);
    });

    it("least privilege: admins cannot read booking requests, private details, or write listings directly", async () => {
      expect((await as(db, asUser(admin), (tx) => tx.query(`select * from public.booking_requests`))).rows).toHaveLength(0);
      expect((await as(db, asUser(admin), (tx) => tx.query(`select * from public.listing_private_details`))).rows).toHaveLength(0);
      const upd = await as(db, asUser(admin), (tx) => tx.query(`update public.parking_listings set title = 'edited by admin' where id = $1`, [listing]));
      expect(upd.affectedRows).toBe(0);
      expect(service).toBeTruthy();
    });

    it("admins can remove abusive photos", async () => {
      const l = await createPublished(db, owner);
      await as(db, asUser(admin), (tx) => tx.query(`select public.admin_set_listing_moderation($1, 'suspended')`, [l]));
      const del = await as(db, asUser(admin), (tx) => tx.query(`delete from public.listing_photos where listing_id = $1`, [l]));
      expect(del.affectedRows).toBeGreaterThan(0);
    });
  });
});
