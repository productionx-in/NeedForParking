# Parking Research Prototype — Hyderabad

A **research prototype** for validating the private / under-used parking market in Hyderabad, India: browse listings, publish a space, request a space, and let owners accept or decline — with real persistence, real SMS-OTP login and database-enforced access control.

> Not a company, not a brand, not production-certified. No payments are taken. Demo listings are fictional and clearly labelled.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · Supabase (Postgres, Auth phone OTP, Storage, `@supabase/ssr`) · Mapbox GL JS · Zod · Vitest + React Testing Library · Playwright.

## Contents
1. [Features](#features) · 2. [Quick start](#quick-start) · 3. [Setup guide](#setup-guide) (Supabase, migrations, phone auth, SMS, redirects, maps, storage, admin, demo data) · 4. [Running & testing](#running-and-testing) · 5. [Deploying](#deploying) · 6. [Security model](#security-model) · 7. [Known limitations](#known-limitations) · 8. [Repository map](#repository-map)

## Features
- **Public:** responsive home, search (locality/title, vehicle, price, hourly/daily/monthly, covered/open, weekday, "available now" in IST, overnight, 24-hour), distance search from a named area / coordinates / browser geolocation (only after an explicit button press), list ↔ map views with synchronized selection, pagination, loading/empty/error states, listing pages with photos, terms, map and safe owner info. Demo data is badged everywhere.
- **Auth:** phone-number sign-in/registration with real SMS OTP (country selector, default India +91), resend cooldown, per-number/per-IP rate limits, clear errors, sign-out, profile (display name, optional email). No hard-coded OTP, no fake success: with no backend/provider it shows a setup error.
- **Listings:** six-step validated wizard (basics → location with draggable map pin → photos with upload progress → price/availability → rules/access → declarations), draft / published / paused / removed, preview, edit, delete (soft). Publishing is validated in the app **and** by a database trigger.
- **Privacy by design:** the public table holds only disclosable fields. Exact address, exact pin and access instructions live in a separate owner-only table. Public coordinates are **computed by the database**, snapped to a ~430 m grid unless the owner opts in to exact location. Distance search uses the public (snapped) point.
- **Requests:** one-time or recurring (weekdays, time window); statuses pending/accepted/declined/cancelled/completed; owner can't request own space; server+DB validation of dates, availability, vehicle type, minimum duration; overlapping accepted slots are impossible (serialised with advisory locks); accepted requesters (only) receive the exact address and access instructions.
- **Dashboard:** profile, my listings, incoming requests, my requests, favorites, account/security.
- **Admin:** reports queue, suspend/restore listings, suspend/reactivate accounts, audit log. Admin is a database role changed only out-of-band; every action is re-authorized inside the database.

## Quick start
```bash
npm install
cp .env.example .env.local          # fill in Supabase values (see Setup guide)
# apply supabase/migrations/*.sql to your project (see below)
npm run dev                          # http://localhost:3000
```
Without `.env.local` the app still starts and shows setup notices instead of data.

## Setup guide

### 1. Create a Supabase project
<https://supabase.com/dashboard> → *New project*. Choose a region near India (e.g. Mumbai/Singapore). Copy **Project URL** and the **publishable key** (*Project Settings → API Keys*) into `.env.local`.

### 2. Apply the database migrations
Migrations are plain SQL in `supabase/migrations/` (apply in filename order):

| File | Contents |
| --- | --- |
| `…01_schema.sql` | tables, constraints, indexes |
| `…02_functions_triggers.sql` | auth helpers, guard triggers, publish/request/overlap rules |
| `…03_rls_and_grants.sql` | RLS on every table + explicit column-level grants |
| `…04_rpc_search_admin.sql` | `search_listings`, owner/disclosure RPCs, admin RPCs |
| `…05_storage.sql` | `listing-photos` bucket + storage policies |
| `…06_harden_functions.sql` | advisor fixes: revoke trigger fn from API roles, pin `search_path` |

Either **CLI** — `npx supabase login && npx supabase link --project-ref <ref> && npx supabase db push` — or paste each file into the dashboard **SQL Editor** in order.

### 3. Enable phone authentication
Dashboard → *Authentication → Sign In / Providers → Phone* → enable. Keep **Enable phone confirmations** on. Recommended hardening (provider security guidance): short OTP expiry (default 60 s–1 h; shorter is better), *Authentication → Rate Limits* (SMS per hour), *Attack Protection → CAPTCHA* (hCaptcha/Turnstile) before any public launch, and leave email-based sign-up disabled unless you need it.

### 4. Configure an SMS provider and test delivery
In the same Phone settings choose Twilio / Twilio Verify / MessageBird / Vonage / TextLocal and paste its credentials.
- **India (+91) needs DLT registration** (entity, sender ID and approved templates) with most providers — SMS to Indian numbers silently fails without it. Do this with your provider first.
- Test with your own phone: open `/login`, enter your number, receive the code. If the provider is missing or rejects the message the app says **“No code was sent”** and links you here — it never pretends.
- For automated tests use **Phone numbers for testing** (same settings page): register numbers like `919876500001` with fixed OTP `123456`. These never send SMS. Use them only in a *dedicated test project*, never in production.

### 5. Allowed redirect URLs
*Authentication → URL Configuration*: **Site URL** = your deployed origin; **Redirect URLs** = `http://localhost:3000/**` plus your production/preview origins. (Phone-OTP itself doesn't redirect, but this is required if you later enable email links/OAuth.)

### 6. Map credentials
Create a **public** Mapbox token (`pk.…`) at <https://account.mapbox.com/>, restrict it to your URLs, set `NEXT_PUBLIC_MAPBOX_TOKEN`. Optional: without it the map is replaced by a notice, the pin picker falls back to latitude/longitude fields, and everything else works.

### 7. Storage and policies
Migration `…05_storage.sql` creates the public-read `listing-photos` bucket (5 MiB, JPEG/PNG/WebP). Objects must live at `<owner_id>/<listing_id>/<file>.(jpg|png|webp)`; **insert/update** require the caller to own that listing, have a verified phone and an active account; **delete** is owner-or-admin. Verify in *Storage → Policies*.

### 8. Make an admin (out-of-band, by design)
There is intentionally no UI/API for this. After the person has signed in once, run in the SQL editor:
```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where phone = '919876500001');  -- phone without '+'
```
Clients cannot change `role` (column privileges + trigger), and JWT `user_metadata` is ignored.

### 9. Optional demo data
```bash
# in .env.local (never in hosting env):  SUPABASE_SERVICE_ROLE_KEY=...
npm run seed:demo      # 8 fictional listings (Madhapur, Kondapur, Gachibowli, Ameerpet, …)
npm run unseed:demo    # removes all demo owners + listings
```
Demo rows are flagged `is_demo`, titled “[Demo] …”, use placeholder addresses, have no photos, show a “DEMO DATA” badge, and **cannot be requested**. Idempotent.

## Running and testing

**Local dev command:** `npm run dev` → <http://localhost:3000>

| Command | What it does |
| --- | --- |
| `npm run typecheck` / `npm run lint` | TypeScript strict / ESLint |
| `npm test` | all Vitest suites (unit + DB) |
| `npm run test:unit` | validation, rules, actions (mocked Supabase), React components |
| `npm run test:db` | applies the **real migrations** to an in-process Postgres (PGlite) and tests RLS, triggers, RPCs, storage policies as `anon` / `authenticated` / `service_role` — no install, no network |
| `npm run test:e2e` | Playwright flows (see below) |
| `npm run check` | typecheck + lint + all Vitest |

### End-to-end tests
`tests/e2e/smoke.spec.ts` (public pages, responsive overflow, keyboard skip-link, no console/hydration errors, visitor redirects) needs nothing. The journey specs need a **dedicated test backend** and provider **test phone numbers** — never production:
```bash
# .env.e2e (git-ignored) or shell
E2E_OWNER_PHONE=9876500001   E2E_OWNER_OTP=123456
E2E_RENTER_PHONE=9876500002  E2E_RENTER_OTP=123456
E2E_THIRD_PHONE=9876500003   E2E_THIRD_OTP=123456
E2E_ADMIN_PHONE=9876500004   E2E_ADMIN_OTP=123456   # optional; promote it to admin via SQL first
E2E_COUNTRY=IN
# optional: PW_CHROMIUM_PATH=/path/to/chromium  (use a pre-installed browser)
npx playwright install chromium && npm run test:e2e
```
Flows covered: visitor search → open listing; OTP sign-in (incl. wrong code, resend cooldown); verified user creates + publishes (real photo upload); other user requests (invalid range, own-listing, overlap); owner accepts/declines; cancel; cannot edit others' listings; visitor blocked from protected UI and direct API calls; storage upload restrictions; sign-out; admin report → suspend. Without test numbers these skip with a clear reason. The app deliberately allows one SMS per number per minute, so use a distinct number per signed-in user.

## Deploying
Any Node host works; Vercel is the simplest:
1. Push the repo, import it in Vercel (framework: Next.js).
2. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_MAPBOX_TOKEN`, `NEXT_PUBLIC_SITE_URL` (**not** the service-role key).
3. In Supabase set Site URL / Redirect URLs to the deployed origin; restrict the Mapbox token to it.
4. Deploy. Before any public use: enable CAPTCHA and SMS rate limits, review the limitations below.

## Security model
- **Identity** comes only from the verified Supabase session (`auth.getUser()` on the server, `auth.uid()` in SQL). User ids, roles, ownership and booking status sent by the browser are never trusted — server actions stamp `owner_id`/`requester_id` themselves and the database re-checks.
- **RLS on every table** with explicit grants; clients can't write `role`, `account_status`, moderation fields, computed public coordinates, `is_demo`, or another user's ids (column privileges + guard triggers). No service-role key in the app runtime.
- **Public reads** are limited to published, un-suspended listings of active owners; phones, emails, exact address/pin, access instructions and request messages are never in public queries.
- **Admin:** role in `profiles.role` (set only via SQL/service role); all admin mutations are `SECURITY DEFINER` functions that check `is_admin()` and write an audit log; admins can't read booking requests or private details and can't suspend admins/themselves.
- **Verified phone required** (RLS `can_transact()`) to create listings, requests, reports and to upload photos.
- Open-redirect-safe `next`, security headers, input validation with Zod on client and server, SQL via parameterised PostgREST/RPC only.

## Known limitations
- **OTP throttling in the app is in-memory per server instance** (a speed bump). The authoritative limits are Supabase's; add CAPTCHA before launch.
- Photos live in a **public bucket** (unguessable UUID paths). Photos of unpublished listings are reachable by anyone who has the URL. No content moderation/EXIF stripping; MIME/size are enforced by bucket config and extension rules, not by inspecting file bytes.
- "Approximate" location is a deterministic ~430 m grid — adequate for a prototype, not a formal privacy guarantee (a determined observer can learn the grid cell).
- Email on the profile is unverified and informational. No account self-deletion. Suspending an account does not revoke its existing sessions (it blocks all writes and hides its listings).
- No messaging, payments, reviews, notifications or calendar sync. Overlap detection treats a request without times as the whole day; a one-time range of 7+ days counts as every weekday.
- `supabase/config.toml` is hand-written and untested. Locality centre points are rough (±1 km).
- `npm audit` reports a dev-only advisory in a transitive `braces` dependency (via `eslint-config-next`); it does not ship in the app.

## Repository map
```
src/app/            routes (App Router) + server actions in app/actions/
src/components/     UI (ui.tsx primitives, wizard/, search/, map/, dashboard/, admin/)
src/lib/            env, supabase clients (server/browser/proxy), auth helpers, validation (Zod), domain rules, data access
src/proxy.ts        session refresh + gate for /dashboard and /admin
supabase/           migrations/, config.toml (local CLI)
scripts/            seed-demo.ts, demo-data.ts
tests/unit|db|e2e   Vitest (+RTL), PGlite database tests, Playwright
```
