import { describe, it, expect, beforeAll } from "vitest";
import {
  createTestDb, createUser, createDraft, createPublished, addPhoto, setStatus, as, asUser, anon, service,
  expectDbError, VALID_PRIVATE, type Db,
} from "./helpers";

describe("listing visibility & publication", () => {
  let db: Db;
  let owner: string;
  let other: string;
  beforeAll(async () => {
    db = await createTestDb();
    owner = await createUser(db, { name: "Owner One" });
    other = await createUser(db, { name: "Someone Else" });
  });

  it("drafts are invisible to the public and to other users, visible to the owner", async () => {
    const id = await createDraft(db, owner);
    const q = (tx: Parameters<Parameters<typeof as>[2]>[0]) => tx.query(`select id from public.parking_listings where id = $1`, [id]);
    expect((await as(db, anon, q)).rows).toHaveLength(0);
    expect((await as(db, asUser(other), q)).rows).toHaveLength(0);
    expect((await as(db, asUser(owner), q)).rows).toHaveLength(1);
  });

  it("publishing requires every mandatory field (and a photo) — enforced in the database", async () => {
    const id = await createDraft(db, owner, { title: "ab", description: "short", vehicle_types: [] , owner_declaration: false, permission_status: "unconfirmed" });
    await expectDbError(setStatus(db, owner, id, "published"), /publish_validation: .*title.*description.*vehicle types.*ownership declaration.*permission.*photo/s);
  });

  it("a complete listing with a photo can be published and becomes publicly readable", async () => {
    const id = await createPublished(db, owner);
    const res = await as(db, anon, (tx) => tx.query(`select id, status from public.parking_listings where id = $1`, [id]));
    expect(res.rows).toHaveLength(1);
  });

  it("publishing without a photo fails", async () => {
    const id = await createDraft(db, owner);
    await expectDbError(setStatus(db, owner, id, "published"), /at least one photo/);
  });

  it("publishing without private address/coordinates fails", async () => {
    const id = await createDraft(db, owner, {}, null);
    await addPhoto(db, owner, id);
    await expectDbError(setStatus(db, owner, id, "published"), /address.*map location/s);
  });

  it("paused and removed listings disappear from public reads; removed cannot be restored", async () => {
    const id = await createPublished(db, owner);
    await setStatus(db, owner, id, "paused");
    const read = (tx: Parameters<Parameters<typeof as>[2]>[0]) => tx.query(`select 1 from public.parking_listings where id = $1`, [id]);
    expect((await as(db, anon, read)).rows).toHaveLength(0);
    await setStatus(db, owner, id, "published");
    expect((await as(db, anon, read)).rows).toHaveLength(1);
    await setStatus(db, owner, id, "removed");
    expect((await as(db, anon, read)).rows).toHaveLength(0);
    await expectDbError(setStatus(db, owner, id, "published"), /invalid_status_transition|removed/);
  });

  it("clients cannot insert a listing directly as published or spoof owner_id", async () => {
    await expectDbError(
      as(db, asUser(owner), (tx) => tx.query(`insert into public.parking_listings (owner_id, status) values ($1, 'published')`, [owner])),
      /new_listing_must_be_draft|row-level security/,
    );
    await expectDbError(
      as(db, asUser(other), (tx) => tx.query(`insert into public.parking_listings (owner_id) values ($1)`, [owner])),
      /row-level security/,
    );
  });

  it("phone-unverified users cannot create listings", async () => {
    const unverified = await createUser(db, { phoneConfirmed: false });
    await expectDbError(
      as(db, asUser(unverified), (tx) => tx.query(`insert into public.parking_listings (owner_id) values ($1)`, [unverified])),
      /row-level security/,
    );
  });

  it("users without any phone cannot create listings", async () => {
    const noPhone = await createUser(db, { phone: null });
    await expectDbError(
      as(db, asUser(noPhone), (tx) => tx.query(`insert into public.parking_listings (owner_id) values ($1)`, [noPhone])),
      /row-level security/,
    );
  });

  it("anonymous users cannot create anything", async () => {
    await expectDbError(
      as(db, anon, (tx) => tx.query(`insert into public.parking_listings (owner_id) values ($1)`, [owner])),
      /permission denied/,
    );
  });
});

describe("listing ownership enforcement", () => {
  let db: Db;
  let owner: string;
  let attacker: string;
  let listing: string;
  beforeAll(async () => {
    db = await createTestDb();
    owner = await createUser(db);
    attacker = await createUser(db);
    listing = await createPublished(db, owner);
  });

  it("another user cannot update a listing (0 rows affected)", async () => {
    const res = await as(db, asUser(attacker), (tx) => tx.query(`update public.parking_listings set title = 'hacked' where id = $1`, [listing]));
    expect(res.affectedRows).toBe(0);
    const title = await db.query<{ title: string }>(`select title from public.parking_listings where id = $1`, [listing]);
    expect(title.rows[0]!.title).not.toBe("hacked");
  });

  it("another user cannot transfer ownership to themselves or change status", async () => {
    const res = await as(db, asUser(attacker), (tx) => tx.query(`update public.parking_listings set status = 'removed' where id = $1`, [listing]));
    expect(res.affectedRows).toBe(0);
  });

  it("the owner cannot reassign owner_id (no column privilege)", async () => {
    await expectDbError(
      as(db, asUser(owner), (tx) => tx.query(`update public.parking_listings set owner_id = $2 where id = $1`, [listing, attacker])),
      /permission denied/,
    );
  });

  it("no one can hard-delete a listing through the API", async () => {
    await expectDbError(
      as(db, asUser(owner), (tx) => tx.query(`delete from public.parking_listings where id = $1`, [listing])),
      /permission denied/,
    );
  });

  it("the owner cannot write server-controlled columns (moderation, demo flag, computed coordinates)", async () => {
    for (const col of ["moderation_status = 'ok'", "is_demo = true", "latitude = 17.4", "longitude = 78.4", "public_address = 'x'", "published_at = now()"]) {
      await expectDbError(
        as(db, asUser(owner), (tx) => tx.query(`update public.parking_listings set ${col} where id = $1`, [listing])),
        /permission denied/,
      );
    }
  });

  it("another user cannot read or modify private details, photos or attach photos", async () => {
    const read = await as(db, asUser(attacker), (tx) => tx.query(`select * from public.listing_private_details where listing_id = $1`, [listing]));
    expect(read.rows).toHaveLength(0);
    const upd = await as(db, asUser(attacker), (tx) => tx.query(`update public.listing_private_details set address_line = 'pwned address' where listing_id = $1`, [listing]));
    expect(upd.affectedRows).toBe(0);
    await expectDbError(
      as(db, asUser(attacker), (tx) => tx.query(`insert into public.listing_photos (listing_id, storage_path) values ($1, $2)`, [listing, `${attacker}/${listing}/a.jpg`])),
      /row-level security|invalid_photo_path/,
    );
    await expectDbError(
      as(db, asUser(attacker), (tx) => tx.query(`insert into public.listing_private_details (listing_id, address_line) values ($1, 'attacker address')`, [listing])),
      /row-level security|duplicate key/,
    );
    const del = await as(db, asUser(attacker), (tx) => tx.query(`delete from public.listing_photos where listing_id = $1`, [listing]));
    expect(del.affectedRows).toBe(0);
  });
});

describe("privacy of public data", () => {
  let db: Db;
  let owner: string;
  beforeAll(async () => {
    db = await createTestDb();
    owner = await createUser(db, { phone: "+919000011111", name: "Priya Owner" });
  });

  it("anon cannot read private details, profiles or auth data", async () => {
    const id = await createPublished(db, owner);
    await expectDbError(as(db, anon, (tx) => tx.query(`select * from public.listing_private_details`)), /permission denied/);
    await expectDbError(as(db, anon, (tx) => tx.query(`select * from public.profiles`)), /permission denied/);
    await expectDbError(as(db, anon, (tx) => tx.query(`select * from auth.users`)), /permission denied/);
    await expectDbError(as(db, asUser(await createUser(db)), (tx) => tx.query(`select * from auth.users`)), /permission denied/);
    expect(id).toBeTruthy();
  });

  it("public coordinates are snapped to a grid and never equal the exact pin (approximate mode)", async () => {
    const id = await createPublished(db, owner, {}, { exact_latitude: 17.448612, exact_longitude: 78.390871 });
    const pub = await as(db, anon, (tx) => tx.query<{ latitude: number; longitude: number; public_address: string | null }>(
      `select latitude, longitude, public_address from public.parking_listings where id = $1`, [id]));
    const { latitude, longitude, public_address } = pub.rows[0]!;
    expect(latitude).not.toBe(17.448612);
    expect(longitude).not.toBe(78.390871);
    expect(Math.abs(latitude - 17.448612)).toBeLessThan(0.0035);
    expect(Math.abs(longitude - 78.390871)).toBeLessThan(0.0035);
    expect(public_address).toBeNull();
    // Grid snapping is deterministic: nearby exact points collapse to the same public point.
    const id2 = await createPublished(db, owner, {}, { exact_latitude: 17.4491, exact_longitude: 78.3913 });
    const pub2 = await as(db, anon, (tx) => tx.query<{ latitude: number }>(`select latitude from public.parking_listings where id = $1`, [id2]));
    expect(pub2.rows[0]!.latitude).toBe(latitude);
  });

  it("the owner can deliberately opt in to exact coordinates and a public address", async () => {
    const id = await createPublished(db, owner, {}, { exact_latitude: 17.448612, exact_longitude: 78.390871, address_line: "Fictional Plaza, Test Lane" });
    await as(db, asUser(owner), (tx) => tx.query(`update public.parking_listings set location_privacy = 'exact', show_address_publicly = true where id = $1`, [id]));
    const pub = await as(db, anon, (tx) => tx.query<{ latitude: number; longitude: number; public_address: string }>(
      `select latitude, longitude, public_address from public.parking_listings where id = $1`, [id]));
    expect(pub.rows[0]).toEqual({ latitude: 17.448612, longitude: 78.390871, public_address: "Fictional Plaza, Test Lane" });
    // and can revert
    await as(db, asUser(owner), (tx) => tx.query(`update public.parking_listings set location_privacy = 'approximate', show_address_publicly = false where id = $1`, [id]));
    const back = await as(db, anon, (tx) => tx.query<{ latitude: number; public_address: string | null }>(`select latitude, public_address from public.parking_listings where id = $1`, [id]));
    expect(back.rows[0]!.latitude).not.toBe(17.448612);
    expect(back.rows[0]!.public_address).toBeNull();
  });

  it("changing the private pin updates the public coordinates", async () => {
    const id = await createPublished(db, owner);
    await as(db, asUser(owner), (tx) => tx.query(`update public.listing_private_details set exact_latitude = 17.5001, exact_longitude = 78.5001 where listing_id = $1`, [id]));
    const pub = await as(db, anon, (tx) => tx.query<{ latitude: number }>(`select latitude from public.parking_listings where id = $1`, [id]));
    expect(Math.abs(pub.rows[0]!.latitude - 17.5001)).toBeLessThan(0.0035);
  });

  it("the public owner profile exposes only name, member-since and a verified flag", async () => {
    const id = await createPublished(db, owner);
    const res = await as(db, anon, (tx) => tx.query<Record<string, unknown>>(`select * from public.get_public_owner($1)`, [owner]));
    expect(Object.keys(res.rows[0]!).sort()).toEqual(["display_name", "member_since", "phone_verified", "published_count"]);
    expect(res.rows[0]!.display_name).toBe("Priya Owner");
    expect(res.rows[0]!.phone_verified).toBe(true);
    expect(JSON.stringify(res.rows[0])).not.toContain("9000011111");
    expect(id).toBeTruthy();
    // owners without a public listing are not disclosed at all
    const quiet = await createUser(db);
    const none = await as(db, anon, (tx) => tx.query(`select * from public.get_public_owner($1)`, [quiet]));
    expect(none.rows).toHaveLength(0);
  });

  it("a stranger cannot read another user's profile, but can read their own", async () => {
    const a = await createUser(db);
    const b = await createUser(db);
    const seeOther = await as(db, asUser(a), (tx) => tx.query(`select * from public.profiles where id = $1`, [b]));
    expect(seeOther.rows).toHaveLength(0);
    const seeSelf = await as(db, asUser(a), (tx) => tx.query(`select * from public.profiles where id = $1`, [a]));
    expect(seeSelf.rows).toHaveLength(1);
  });
});

describe("profiles & privilege escalation", () => {
  let db: Db;
  let user: string;
  beforeAll(async () => {
    db = await createTestDb();
    user = await createUser(db);
  });

  it("a user can update display name and email only", async () => {
    await as(db, asUser(user), (tx) => tx.query(`update public.profiles set display_name = 'New Name', email = 'me@example.com' where id = $1`, [user]));
    const r = await db.query<{ display_name: string; email: string }>(`select display_name, email from public.profiles where id = $1`, [user]);
    expect(r.rows[0]).toEqual({ display_name: "New Name", email: "me@example.com" });
  });

  it("rejects malformed email", async () => {
    await expectDbError(as(db, asUser(user), (tx) => tx.query(`update public.profiles set email = 'not-an-email' where id = $1`, [user])), /check constraint/);
  });

  it("a user cannot make themselves admin or lift a suspension", async () => {
    await expectDbError(as(db, asUser(user), (tx) => tx.query(`update public.profiles set role = 'admin' where id = $1`, [user])), /permission denied/);
    await expectDbError(as(db, asUser(user), (tx) => tx.query(`update public.profiles set account_status = 'active' where id = $1`, [user])), /permission denied/);
    const r = await db.query<{ role: string }>(`select role from public.profiles where id = $1`, [user]);
    expect(r.rows[0]!.role).toBe("user");
  });

  it("users cannot insert or delete profiles", async () => {
    await expectDbError(as(db, asUser(user), (tx) => tx.query(`insert into public.profiles (id, role) values (gen_random_uuid(), 'admin')`)), /permission denied/);
    await expectDbError(as(db, asUser(user), (tx) => tx.query(`delete from public.profiles where id = $1`, [user])), /permission denied/);
  });

  it("user_metadata-style flags give no privileges: role only comes from profiles.role", async () => {
    const res = await as(db, asUser(user), (tx) => tx.query<{ is_admin: boolean }>(`select public.is_admin() as is_admin`));
    expect(res.rows[0]!.is_admin).toBe(false);
  });

  it("the service role can promote an admin (the documented, out-of-band path)", async () => {
    await as(db, service, (tx) => tx.query(`update public.profiles set role = 'admin' where id = $1`, [user]));
    const res = await as(db, asUser(user), (tx) => tx.query<{ is_admin: boolean }>(`select public.is_admin() as is_admin`));
    expect(res.rows[0]!.is_admin).toBe(true);
  });
});

describe("favorites", () => {
  let db: Db;
  beforeAll(async () => {
    db = await createTestDb();
  });

  it("users manage only their own favorites, of public listings only", async () => {
    const owner = await createUser(db);
    const a = await createUser(db);
    const b = await createUser(db);
    const pub = await createPublished(db, owner);
    const draft = await createDraft(db, owner);
    await as(db, asUser(a), (tx) => tx.query(`insert into public.favorites (user_id, listing_id) values ($1, $2)`, [a, pub]));
    await expectDbError(as(db, asUser(a), (tx) => tx.query(`insert into public.favorites (user_id, listing_id) values ($1, $2)`, [a, draft])), /row-level security/);
    await expectDbError(as(db, asUser(b), (tx) => tx.query(`insert into public.favorites (user_id, listing_id) values ($1, $2)`, [a, pub])), /row-level security/);
    expect((await as(db, asUser(b), (tx) => tx.query(`select * from public.favorites`))).rows).toHaveLength(0);
    expect((await as(db, asUser(a), (tx) => tx.query(`select * from public.favorites`))).rows).toHaveLength(1);
    const del = await as(db, asUser(b), (tx) => tx.query(`delete from public.favorites where user_id = $1`, [a]));
    expect(del.affectedRows).toBe(0);
    await expectDbError(as(db, anon, (tx) => tx.query(`select * from public.favorites`)), /permission denied/);
  });
});

describe("photo rules", () => {
  let db: Db;
  let owner: string;
  beforeAll(async () => {
    db = await createTestDb();
    owner = await createUser(db);
  });

  it("photo paths must be <owner>/<listing>/<file>", async () => {
    const id = await createDraft(db, owner);
    for (const bad of [`someone-else/${id}/a.jpg`, `${owner}/${id}`, `${owner}/other-listing/a.jpg`, `${owner}/${id}/x/y.jpg`, `${owner}/${id}/`]) {
      await expectDbError(
        as(db, asUser(owner), (tx) => tx.query(`insert into public.listing_photos (listing_id, storage_path) values ($1, $2)`, [id, bad])),
        /invalid_photo_path/,
      );
    }
  });

  it("limits a listing to 10 photos", async () => {
    const id = await createDraft(db, owner);
    for (let i = 0; i < 10; i++) await addPhoto(db, owner, id, `p${i}.jpg`);
    await expectDbError(addPhoto(db, owner, id, "p11.jpg"), /photo_limit_reached/);
  });

  it("a published listing cannot lose its last photo", async () => {
    const id = await createPublished(db, owner);
    await expectDbError(
      as(db, asUser(owner), (tx) => tx.query(`delete from public.listing_photos where listing_id = $1`, [id])),
      /published_listing_needs_photo/,
    );
    await setStatus(db, owner, id, "paused");
    await as(db, asUser(owner), (tx) => tx.query(`delete from public.listing_photos where listing_id = $1`, [id]));
  });

  it("photos of unpublished listings are not publicly readable; published ones are", async () => {
    const draft = await createDraft(db, owner);
    await addPhoto(db, owner, draft);
    const pub = await createPublished(db, owner);
    const seen = await as(db, anon, (tx) => tx.query<{ listing_id: string }>(`select listing_id from public.listing_photos`));
    const ids = seen.rows.map((r) => r.listing_id);
    expect(ids).toContain(pub);
    expect(ids).not.toContain(draft);
  });
});

describe("storage bucket policies", () => {
  let db: Db;
  let owner: string;
  let other: string;
  let listing: string;
  beforeAll(async () => {
    db = await createTestDb();
    owner = await createUser(db);
    other = await createUser(db);
    listing = await createDraft(db, owner);
  });

  const insertObj = (db: Db, who: ReturnType<typeof asUser> | typeof anon, name: string, bucket = "listing-photos") =>
    as(db, who, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [bucket, name]));

  it("bucket is configured with size and MIME restrictions", async () => {
    const b = await db.query<{ public: boolean; file_size_limit: string; allowed_mime_types: string[] }>(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'listing-photos'`);
    expect(b.rows[0]!.public).toBe(true);
    expect(Number(b.rows[0]!.file_size_limit)).toBe(5 * 1024 * 1024);
    expect(b.rows[0]!.allowed_mime_types).toEqual(["image/jpeg", "image/png", "image/webp"]);
  });

  it("the owner can upload into their own listing folder", async () => {
    await insertObj(db, asUser(owner), `${owner}/${listing}/photo1.jpg`);
    await insertObj(db, asUser(owner), `${owner}/${listing}/photo2.WEBP`);
  });

  it("other users cannot upload into the owner's folder or to a listing they don't own", async () => {
    await expectDbError(insertObj(db, asUser(other), `${owner}/${listing}/evil.jpg`), /row-level security/);
    await expectDbError(insertObj(db, asUser(other), `${other}/${listing}/evil.jpg`), /row-level security/);
  });

  it("anonymous users cannot upload", async () => {
    await expectDbError(insertObj(db, anon, `${owner}/${listing}/x.jpg`), /row-level security|permission denied/);
  });

  it("rejects malformed paths and non-image extensions", async () => {
    for (const bad of [`${owner}/${listing}/script.html`, `${owner}/${listing}/a.svg`, `${owner}/${listing}/a.jpg.exe`, `${owner}/not-a-uuid/a.jpg`, `${owner}/${listing}/sub/a.jpg`, `${owner}/a.jpg`, `../${listing}/a.jpg`]) {
      await expectDbError(insertObj(db, asUser(owner), bad), /row-level security/);
    }
  });

  it("rejects uploads to other buckets under these policies", async () => {
    await db.exec(`insert into storage.buckets (id, name) values ('other', 'other') on conflict do nothing`);
    await expectDbError(insertObj(db, asUser(owner), `${owner}/${listing}/a.jpg`, "other"), /row-level security/);
  });

  it("a suspended account or phone-unverified user cannot upload", async () => {
    const suspended = await createUser(db, { suspended: true });
    const l = await createDraft(db, owner);
    await expectDbError(insertObj(db, asUser(suspended), `${suspended}/${l}/a.jpg`), /row-level security/);
    const unverified = await createUser(db, { phoneConfirmed: false });
    await expectDbError(insertObj(db, asUser(unverified), `${unverified}/${l}/a.jpg`), /row-level security/);
  });

  it("only the owner can delete their objects; strangers delete nothing", async () => {
    const name = `${owner}/${listing}/photo1.jpg`;
    const del = await as(db, asUser(other), (tx) => tx.query(`delete from storage.objects where name = $1`, [name]));
    expect(del.affectedRows).toBe(0);
    const ok = await as(db, asUser(owner), (tx) => tx.query(`delete from storage.objects where name = $1`, [name]));
    expect(ok.affectedRows).toBe(1);
  });

  it("only the owner can update (replace) their objects", async () => {
    const name = `${owner}/${listing}/photo2.WEBP`;
    const bad = await as(db, asUser(other), (tx) => tx.query(`update storage.objects set metadata = '{"x":1}' where name = $1`, [name]));
    expect(bad.affectedRows).toBe(0);
    const ok = await as(db, asUser(owner), (tx) => tx.query(`update storage.objects set metadata = '{"x":1}' where name = $1`, [name]));
    expect(ok.affectedRows).toBe(1);
  });

  it("an owner cannot move an object into another user's folder via update", async () => {
    const name = `${owner}/${listing}/photo2.WEBP`;
    await expectDbError(
      as(db, asUser(owner), (tx) => tx.query(`update storage.objects set name = $2 where name = $1`, [name, `${other}/${listing}/photo2.webp`])),
      /row-level security/,
    );
  });
});

describe("private details disclosure to accepted requesters", () => {
  it("is covered in requests.test.ts", () => {
    expect(VALID_PRIVATE.address_line).toBeTruthy();
  });
});
