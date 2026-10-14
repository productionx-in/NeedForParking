import zlib from "node:zlib";
import { expect, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

/**
 * E2E configuration comes from the environment (.env.e2e or the shell). It must point at a DEDICATED TEST
 * Supabase project (or the Supabase CLI local stack) where these numbers are registered as provider-supported
 * test phone numbers with fixed OTPs — see README → "End-to-end tests". Real production OTP security is never
 * bypassed: with no test numbers configured, the authenticated flows are skipped.
 */
export const users = {
  owner: { phone: process.env.E2E_OWNER_PHONE ?? "", otp: process.env.E2E_OWNER_OTP ?? "" },
  renter: { phone: process.env.E2E_RENTER_PHONE ?? "", otp: process.env.E2E_RENTER_OTP ?? "" },
  third: { phone: process.env.E2E_THIRD_PHONE ?? "", otp: process.env.E2E_THIRD_OTP ?? "" },
  admin: { phone: process.env.E2E_ADMIN_PHONE ?? "", otp: process.env.E2E_ADMIN_OTP ?? "" },
};
export type Who = keyof typeof users;
export const country = process.env.E2E_COUNTRY ?? "IN";
export const hasBackend = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && users.owner.phone && users.owner.otp && users.renter.phone && users.renter.otp);
export const SKIP_REASON = "Needs a test Supabase project with provider test phone numbers: set E2E_OWNER_PHONE/OTP, E2E_RENTER_PHONE/OTP (and E2E_THIRD_*), see README.";

// A small but real PNG (solid colour), generated in-process so no fixture file is needed.
function makePng(width: number, height: number, rgb: [number, number, number]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => rgb).flat())]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
export const PNG_BYTES = makePng(64, 48, [13, 148, 136]);

/**
 * Pages fill controlled React forms; wait for hydration after every navigation so input isn't lost to a late re-render.
 * Apply to every page you create: `const page = await newPage(context)`.
 */
export async function newPage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  const goto = page.goto.bind(page);
  page.goto = (async (url: string, options?: Parameters<Page["goto"]>[1]) => {
    const res = await goto(url, options);
    await page.waitForSelector('html[data-hydrated="true"]', { timeout: 15_000 }).catch(() => undefined);
    // Page content streams in its own Suspense boundary and can hydrate after the layout marker fires; let it settle.
    await page.waitForLoadState("networkidle").catch(() => undefined);
    return res;
  }) as Page["goto"];
  return page;
}

export const istDate = (daysAhead: number) => new Date(Date.now() + 5.5 * 3600_000 + daysAhead * 86400_000).toISOString().slice(0, 10);

/** Signs in through the real UI: phone → SMS code (provider test OTP) → dashboard. */
export async function signIn(page: Page, who: Who, next = "/dashboard", opts: { wrongCodeFirst?: boolean } = {}) {
  const u = users[who];
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await expect(page.getByLabel("Country")).toHaveValue(country);
  await page.getByLabel(/Mobile number/).fill(u.phone);
  // The app deliberately allows one SMS per number per minute. If a previous run just asked for a code, wait it out.
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByRole("button", { name: "Send code" }).click();
    const sent = page.getByText("Check your messages");
    const throttled = page.getByText(/Please wait \d+s before requesting another code/);
    await expect(sent.or(throttled)).toBeVisible({ timeout: 15_000 });
    if (await sent.isVisible()) break;
    const seconds = Number(/(\d+)s/.exec((await throttled.first().innerText()) ?? "")?.[1] ?? 60);
    await page.waitForTimeout((seconds + 1) * 1000);
  }
  if (opts.wrongCodeFirst) {
    await page.getByLabel(/6-digit code/).fill("000000");
    await page.getByRole("button", { name: "Verify and continue" }).click();
    await expect(page.getByText(/incorrect or has expired/)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "Resend code" })).toBeDisabled(); // resend cooldown is enforced
  }
  await page.getByLabel(/6-digit code/).fill(u.otp);
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
}

export async function setDisplayName(page: Page, name: string) {
  await page.goto("/dashboard/profile");
  await page.getByLabel("Display name").fill(name);
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
}

export type NewListing = { title: string; address: string; locality?: string; price?: string };

/** Walks the whole six-step wizard through the UI and publishes. Returns the listing id. */
export async function createAndPublishListing(page: Page, l: NewListing): Promise<string> {
  await page.goto("/dashboard/listings/new");
  // 1. Basics
  await page.getByLabel("Listing title").fill(l.title);
  await page.getByLabel(/^Description/).fill("A covered car parking bay inside a gated community, easy access from the main road. Fictional e2e listing.");
  await page.getByLabel("Car", { exact: true }).check();
  await page.getByLabel("Covered", { exact: true }).check();
  await page.getByRole("button", { name: "Save & continue" }).click();
  // 2. Location
  await expect(page.getByRole("heading", { name: "Location" })).toBeVisible();
  await page.getByLabel(/Full address/).fill(l.address);
  await page.getByLabel("Locality").fill(l.locality ?? "Madhapur");
  await page.getByLabel("PIN code").fill("500081");
  await page.getByLabel("Latitude").fill("17.4486");
  await page.getByLabel("Longitude").fill("78.3908");
  await page.getByRole("button", { name: "Save & continue" }).click();
  // 3. Photos (real upload to Storage with progress)
  await expect(page.getByRole("heading", { name: "Photos" })).toBeVisible();
  await page.locator("#photo-input").setInputFiles({ name: "bay.png", mimeType: "image/png", buffer: PNG_BYTES });
  await expect(page.getByText("Uploaded", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("list", { name: "Listing photos" }).getByRole("listitem")).toHaveCount(1);
  await page.getByRole("button", { name: "Save & continue" }).click();
  // 4. Pricing & availability
  await expect(page.getByRole("heading", { name: "Price & availability" })).toBeVisible();
  await page.getByLabel("Rental type").selectOption("daily");
  await page.getByLabel(/^Price in/).fill(l.price ?? "150");
  await page.getByLabel(/^Minimum rental/).fill("1");
  for (const d of ["Sat", "Sun"]) await page.getByLabel(d, { exact: true }).check();
  await page.getByLabel("24-hour access").check();
  await page.getByRole("button", { name: "Save & continue" }).click();
  // 5. Rules
  await expect(page.getByRole("heading", { name: "Rules & access" })).toBeVisible();
  await page.getByLabel("CCTV").check();
  await page.getByLabel(/Access instructions/).fill("Gate code 4242 (fictional). Ask for the e2e caretaker.");
  await page.getByRole("button", { name: "Save & continue" }).click();
  // 6. Review & publish
  await expect(page.getByRole("heading", { name: "Review & publish" })).toBeVisible();
  await page.getByLabel(/No additional permission is required/).check();
  await page.getByLabel(/I declare that I own this parking space/).check();
  await page.getByRole("button", { name: "Publish listing" }).click();
  await page.waitForURL(/\/listings\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  return page.url().split("/").pop()!;
}

/** Reads the Supabase access token from the @supabase/ssr auth cookie(s) of a signed-in browser context. */
export async function accessTokenOf(context: BrowserContext): Promise<{ token: string; userId: string }> {
  const cookies = (await context.cookies())
    .filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => Number(a.name.split(".")[1] ?? 0) - Number(b.name.split(".")[1] ?? 0));
  if (cookies.length === 0) throw new Error("No Supabase auth cookie found — is this context signed in?");
  let raw = decodeURIComponent(cookies.map((c) => c.value).join(""));
  if (raw.startsWith("base64-")) raw = Buffer.from(raw.slice(7), "base64url").toString("utf8");
  const session = JSON.parse(raw) as { access_token: string };
  const claims = JSON.parse(Buffer.from(session.access_token.split(".")[1]!, "base64url").toString("utf8")) as { sub: string };
  return { token: session.access_token, userId: claims.sub };
}

export function storageUpload(request: APIRequestContext, objectPath: string, opts: { token?: string; mimeType: string; name: string; body: Buffer }) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "");
  return request.post(`${base}/storage/v1/object/listing-photos/${objectPath}`, {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, Authorization: `Bearer ${opts.token ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!}`, "x-upsert": "false" },
    multipart: { cacheControl: "3600", "": { name: opts.name, mimeType: opts.mimeType, buffer: opts.body } },
  });
}

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "page should not scroll horizontally").toBeLessThanOrEqual(1);
}

export function supabaseRest(request: APIRequestContext, table: string, init: { method: "POST" | "GET" | "PATCH" | "DELETE"; data?: unknown }) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "");
  return request.fetch(`${base}/rest/v1/${table}`, {
    method: init.method,
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, "content-type": "application/json" },
    data: init.data as never,
  });
}
