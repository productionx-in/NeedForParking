/**
 * Optional demo seed: creates CLEARLY-LABELLED FICTIONAL listings so the product can be previewed.
 *
 *   npm run seed:demo            create (idempotent)
 *   npm run unseed:demo          remove all demo owners, listings and their data
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY (server-only!). Run it from your own machine against a project you own.
 * Demo listings are flagged is_demo = true in the database, show a "DEMO DATA" badge everywhere, have no
 * photos, and cannot receive booking requests.
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { DEMO_EMAIL_DOMAIN, DEMO_EMAIL_PREFIX, DEMO_LISTINGS, DEMO_OWNERS, demoEmail } from "./demo-data";
import { toPayload } from "../src/lib/validation/listing";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example). Nothing was changed.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const isDemoUser = (email: string | undefined | null) => Boolean(email && email.startsWith(DEMO_EMAIL_PREFIX) && email.endsWith(`@${DEMO_EMAIL_DOMAIN}`));

async function listDemoUsers() {
  const found: { id: string; email: string }[] = [];
  for (let page = 1; page < 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) if (isDemoUser(u.email)) found.push({ id: u.id, email: u.email! });
    if (data.users.length < 200) break;
  }
  return found;
}

async function remove() {
  const users = await listDemoUsers();
  for (const u of users) {
    const { error } = await supabase.auth.admin.deleteUser(u.id); // cascades to profile, listings, requests, favorites
    if (error) throw error;
  }
  console.log(`Removed ${users.length} demo owner(s) and all of their demo listings.`);
}

async function seed() {
  const existing = await listDemoUsers();
  const ids = new Map<string, string>();
  for (const o of DEMO_OWNERS) {
    let id = existing.find((u) => u.email === demoEmail(o.key))?.id;
    if (!id) {
      const { data, error } = await supabase.auth.admin.createUser({ email: demoEmail(o.key), email_confirm: true, user_metadata: { demo: true } });
      if (error || !data.user) throw error ?? new Error("createUser failed");
      id = data.user.id;
    }
    ids.set(o.key, id);
    const { error } = await supabase.from("profiles").update({ display_name: o.displayName, is_demo: true }).eq("id", id);
    if (error) throw error;
  }

  let created = 0;
  for (const d of DEMO_LISTINGS) {
    const ownerId = ids.get(d.owner)!;
    const { data: found } = await supabase.from("parking_listings").select("id").eq("owner_id", ownerId).eq("title", d.values.title).maybeSingle();
    if (found) continue;
    const { listing, details } = toPayload(d.values);
    const { data: row, error } = await supabase.from("parking_listings").insert({ owner_id: ownerId, is_demo: true, status: "draft", ...listing }).select("id").single();
    if (error || !row) throw error ?? new Error("insert listing failed");
    const { error: dErr } = await supabase.from("listing_private_details").insert({ listing_id: row.id, ...details });
    if (dErr) throw dErr;
    const { error: pErr } = await supabase.from("parking_listings").update({ status: "published" }).eq("id", row.id);
    if (pErr) throw pErr;
    created++;
  }
  console.log(`Demo data ready: ${created} new listing(s) created, ${DEMO_LISTINGS.length - created} already existed.`);
  console.log("Every demo listing is flagged is_demo=true, labelled “DEMO DATA” in the UI, has no photos, and cannot be booked.");
}

const main = process.argv.includes("--remove") ? remove : seed;
main().catch((e) => {
  console.error("Seed failed:", e?.message ?? e);
  process.exit(1);
});
