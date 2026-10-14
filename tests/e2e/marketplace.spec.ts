import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { accessTokenOf, createAndPublishListing, hasBackend, istDate, newPage, PNG_BYTES, setDisplayName, signIn, SKIP_REASON, storageUpload, supabaseRest, users } from "./support";

/**
 * Serial, multi-user journey against a real (test) backend:
 *   owner signs in → publishes a listing → visitor finds it → renter requests it → owner accepts / declines …
 * Every user is a separate browser context (separate cookies/sessions).
 */
test.describe.configure({ mode: "serial", timeout: 90_000 });
test.skip(!hasBackend, SKIP_REASON);

const RUN = Date.now().toString(36);
const TITLE = `E2E bay ${RUN}`;
const ADDRESS = `Fictional E2E Heights ${RUN}, Test Road`;
let owner: Page, renter: Page, third: Page;
let contexts: BrowserContext[] = [];
let listingId = "";

test.beforeAll(async ({ browser }) => {
  contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  owner = await newPage(contexts[0]!);
  renter = await newPage(contexts[1]!);
  third = await newPage(contexts[2]!);
});
test.afterAll(async () => {
  await Promise.all(contexts.map((c) => c.close()));
});

test("2. a user registers / signs in with an SMS code (provider test OTP) and lands in the dashboard", async () => {
  await signIn(owner, "owner");
  await expect(owner.getByRole("navigation", { name: "Dashboard" })).toBeVisible();
  await setDisplayName(owner, `E2E Owner ${RUN}`);
  await signIn(renter, "renter");
  await setDisplayName(renter, `E2E Renter ${RUN}`);
});

test("3. a verified user creates and publishes a listing (multi-step form, photo upload with progress)", async () => {
  listingId = await createAndPublishListing(owner, { title: TITLE, address: ADDRESS });
  await expect(owner.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
  // The owner's own page shows the listing, owner info, and (as the owner) the edit entry point.
  await expect(owner.getByRole("link", { name: "Edit listing" })).toBeVisible();
  await owner.goto("/dashboard/listings");
  await expect(owner.getByRole("heading", { name: TITLE })).toBeVisible();
  await expect(owner.getByText("Published", { exact: true }).first()).toBeVisible();
});

test("1. a visitor searches by locality, filters, and opens the listing — seeing only safe information", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await newPage(ctx);
  await page.goto("/");
  await page.getByRole("search").getByLabel("Locality or title").fill("Madhapur");
  await page.getByRole("search").getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/\/search\?.*q=Madhapur/);
  const card = page.getByTestId("listing-card").filter({ hasText: TITLE });
  await expect(card).toBeVisible();
  await expect(card.getByText(/₹150/)).toBeVisible();
  await expect(card.getByText("Covered", { exact: true })).toBeVisible();
  // Cover photo from Storage actually loads (decorative image, so assert on the element rather than a role).
  const cover = card.locator("img").first();
  await expect(cover).toBeVisible();
  await expect.poll(() => cover.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);

  // Filters operate on real results.
  await page.goto(`/search?q=${encodeURIComponent(TITLE)}&vehicle=car&cover=covered&rental=daily&minPrice=100&maxPrice=200`);
  await expect(page.getByTestId("listing-card").filter({ hasText: TITLE })).toBeVisible();
  await page.goto(`/search?q=${encodeURIComponent(TITLE)}&maxPrice=50`);
  await expect(page.getByRole("heading", { name: "No listings match your search" })).toBeVisible();
  await page.goto(`/search?q=${encodeURIComponent(TITLE)}&vehicle=motorcycle`);
  await expect(page.getByTestId("listing-card")).toHaveCount(0);
  await page.goto(`/search?q=${encodeURIComponent(TITLE)}&view=map`);
  await expect(page.getByTestId("listing-card").filter({ hasText: TITLE })).toBeVisible();
  await expect(page.getByText("Map unavailable").first()).toBeVisible(); // graceful: no map key in the test env

  await page.goto(`/search?q=${encodeURIComponent(TITLE)}`);
  await page.getByRole("link", { name: TITLE }).first().click();
  await expect(page).toHaveURL(new RegExp(`/listings/${listingId}$`));
  await expect(page.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
  await expect(page.getByText("Rental terms")).toBeVisible();
  await expect(page.getByText(`E2E Owner ${RUN}`)).toBeVisible();
  await expect(page.getByText("Phone number verified")).toBeVisible();
  // Privacy: nothing private leaks into the public page.
  const html = await page.content();
  expect(html).not.toContain(ADDRESS);
  expect(html).not.toContain("Gate code 4242");
  expect(html).not.toContain(users.owner.phone);
  expect(html).not.toMatch(/17\.4486|78\.3908/); // exact pin is private; public map uses a snapped point
  await expect(page.getByRole("link", { name: "Sign in to request" })).toBeVisible();
  await ctx.close();
});

test("4. another user requests the space (validated; own listing is blocked)", async () => {
  // Owner cannot request their own space: the form isn't offered.
  await owner.goto(`/listings/${listingId}`);
  await expect(owner.getByText("This is your listing.")).toBeVisible();
  await expect(owner.getByRole("button", { name: "Send request" })).toHaveCount(0);

  await renter.goto(`/listings/${listingId}`);
  // Invalid range is explained before anything is sent.
  await renter.getByLabel("Start date").fill(istDate(6));
  await renter.getByLabel(/^End date/).fill(istDate(4));
  await renter.getByLabel("Message to the owner").fill("Hello! Could I park here for a few days?");
  await renter.getByRole("button", { name: "Send request" }).click();
  await expect(renter.getByText("End date must be on or after the start date")).toBeVisible();

  await renter.getByLabel(/^End date/).fill(istDate(7));
  await renter.getByRole("button", { name: "Send request" }).click();
  await expect(renter.getByText("Request sent", { exact: true })).toBeVisible({ timeout: 15_000 });

  await renter.goto("/dashboard/requests/mine");
  const mine = renter.getByTestId("my-request").filter({ hasText: TITLE });
  await expect(mine).toBeVisible();
  await expect(mine.getByText("Pending", { exact: true })).toBeVisible();
  // Private details are NOT visible while pending.
  await renter.goto(`/listings/${listingId}`);
  expect(await renter.content()).not.toContain(ADDRESS);
  await expect(renter.getByText("Your access details")).toHaveCount(0);
});

test("5. the owner sees the request, accepts it; the requester then sees the access details", async () => {
  await owner.goto("/dashboard/requests/incoming");
  const incoming = owner.getByTestId("incoming-request").filter({ hasText: TITLE });
  await expect(incoming).toBeVisible();
  await expect(incoming.getByText(`E2E Renter ${RUN}`)).toBeVisible();
  await expect(incoming.getByText("Could I park here")).toBeVisible();
  await incoming.getByLabel(/Reply/).fill("Welcome — see you then.");
  await incoming.getByRole("button", { name: "Accept" }).click();
  await expect(incoming.getByText(/Request accepted/)).toBeVisible({ timeout: 15_000 });

  await renter.goto("/dashboard/requests/mine");
  const mine = renter.getByTestId("my-request").filter({ hasText: TITLE });
  await expect(mine.getByText("Accepted", { exact: true }).first()).toBeVisible();
  await expect(mine.getByText("Welcome — see you then.")).toBeVisible();
  await renter.goto(`/listings/${listingId}`);
  const access = renter.getByRole("region", { name: "Your access details" }).or(renter.locator("section", { hasText: "Your access details" }));
  await expect(access).toContainText(ADDRESS);
  await expect(access).toContainText("Gate code 4242");
});

test("overlapping requests are rejected once a slot is accepted; non-overlapping ones can be declined", async () => {
  // A third user tries the same dates → blocked with a clear message.
  test.skip(!users.third.phone, "needs E2E_THIRD_PHONE");
  // The first attempt uses a wrong code to prove it is rejected clearly before the right code works.
  await signIn(third, "third", "/dashboard", { wrongCodeFirst: true });
  await setDisplayName(third, `E2E Third ${RUN}`);
  await third.goto(`/listings/${listingId}`);
  await third.getByLabel("Start date").fill(istDate(5));
  await third.getByLabel(/^End date/).fill(istDate(6));
  await third.getByLabel("Message to the owner").fill("Same dates please, if possible.");
  await third.getByRole("button", { name: "Send request" }).click();
  await expect(third.getByText(/already taken by an accepted request/)).toBeVisible({ timeout: 15_000 });

  // Later, non-overlapping dates are fine; the owner declines this one.
  await third.getByLabel("Start date").fill(istDate(20));
  await third.getByLabel(/^End date/).fill(istDate(21));
  await third.getByRole("button", { name: "Send request" }).click();
  await expect(third.getByText("Request sent", { exact: true })).toBeVisible({ timeout: 15_000 });

  await owner.goto("/dashboard/requests/incoming");
  const pending = owner.getByTestId("incoming-request").filter({ hasText: `E2E Third ${RUN}` });
  await pending.getByLabel(/Reply/).fill("Sorry, not available then.");
  await pending.getByRole("button", { name: "Decline" }).click();
  await expect(pending.getByText("Request declined.")).toBeVisible({ timeout: 15_000 });

  await third.goto("/dashboard/requests/mine");
  const declined = third.getByTestId("my-request").filter({ hasText: TITLE });
  await expect(declined.getByText("Declined", { exact: true })).toBeVisible();
  await expect(declined.getByRole("button", { name: "Cancel request" })).toHaveCount(0); // terminal
});

test("the requester can cancel an eligible request", async () => {
  await renter.goto(`/listings/${listingId}`);
  // Accepted request is still cancellable by its requester.
  await renter.goto("/dashboard/requests/mine");
  const mine = renter.getByTestId("my-request").filter({ hasText: TITLE }).first();
  await mine.getByRole("button", { name: "Cancel request" }).click();
  await expect(mine.getByText("Request cancelled.")).toBeVisible({ timeout: 15_000 });
  await renter.reload();
  await expect(renter.getByTestId("my-request").filter({ hasText: TITLE }).first().getByText("Cancelled", { exact: true })).toBeVisible();
});

test("6. users cannot edit (or even open the editor for) another user's listing", async () => {
  await renter.goto(`/dashboard/listings/${listingId}/edit`);
  await expect(renter.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
  await renter.goto("/dashboard/listings");
  await expect(renter.getByText(TITLE)).toHaveCount(0);
  // Not an admin either.
  await renter.goto("/admin");
  await expect(renter.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
  // The owner can.
  await owner.goto(`/dashboard/listings/${listingId}/edit`);
  await expect(owner.getByRole("heading", { name: "Edit listing" })).toBeVisible();
  await expect(owner.getByLabel("Listing title")).toHaveValue(TITLE);
});

test("owners can pause, resume and delete their own listing; paused listings disappear from search", async ({ browser }) => {
  await owner.goto("/dashboard/listings");
  const row = owner.locator("li", { has: owner.getByRole("heading", { name: TITLE }) });
  await row.getByRole("button", { name: "Pause" }).click();
  await expect(row.getByText(/Listing paused/)).toBeVisible({ timeout: 15_000 });
  const ctx = await browser.newContext();
  const visitor = await newPage(ctx);
  await visitor.goto(`/search?q=${encodeURIComponent(TITLE)}`);
  await expect(visitor.getByTestId("listing-card")).toHaveCount(0);
  await visitor.goto(`/listings/${listingId}`);
  await expect(visitor.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
  await owner.reload();
  await owner.locator("li", { has: owner.getByRole("heading", { name: TITLE }) }).getByRole("button", { name: "Resume" }).click();
  await expect(owner.locator("li", { has: owner.getByRole("heading", { name: TITLE }) }).getByText(/published/i).first()).toBeVisible({ timeout: 15_000 });
  await visitor.goto(`/search?q=${encodeURIComponent(TITLE)}`);
  await expect(visitor.getByTestId("listing-card")).toHaveCount(1);
  await ctx.close();
});

test("7. a visitor cannot perform protected actions (UI and API)", async ({ browser, request }) => {
  const ctx = await browser.newContext();
  const visitor = await newPage(ctx);
  for (const path of ["/dashboard", "/dashboard/listings/new", `/dashboard/listings/${listingId}/edit`, "/dashboard/requests/incoming", "/admin"]) {
    await visitor.goto(path);
    await expect(visitor).toHaveURL(/\/login\?next=/);
  }
  await visitor.goto(`/listings/${listingId}`);
  await expect(visitor.getByRole("link", { name: "Sign in to request" })).toBeVisible();
  await expect(visitor.getByRole("link", { name: /Sign in to save/ })).toBeVisible();
  await expect(visitor.getByText("Report this listing")).toHaveCount(0);
  await ctx.close();

  // Direct API calls with only the public key are refused by the database itself.
  const insertRequest = await supabaseRest(request, "booking_requests", { method: "POST", data: { listing_id: listingId, schedule_type: "one_time", start_date: istDate(30), end_date: istDate(31), vehicle_type: "car" } });
  expect([401, 403]).toContain(insertRequest.status());
  const insertListing = await supabaseRest(request, "parking_listings", { method: "POST", data: { title: "hacked" } });
  expect([401, 403]).toContain(insertListing.status());
  const readPrivate = await supabaseRest(request, "listing_private_details?select=*", { method: "GET" });
  expect([401, 403]).toContain(readPrivate.status());
  const readRequests = await supabaseRest(request, "booking_requests?select=*", { method: "GET" });
  expect([401, 403]).toContain(readRequests.status());
  const patch = await supabaseRest(request, `parking_listings?id=eq.${listingId}`, { method: "PATCH", data: { title: "hacked" } });
  expect([401, 403]).toContain(patch.status());
  // …and public data stays readable but only safe columns of published rows.
  const pub = await supabaseRest(request, `parking_listings?id=eq.${listingId}&select=*`, { method: "GET" });
  expect(pub.status()).toBe(200);
  const [row] = await pub.json();
  expect(row.title).toBe(TITLE);
  expect(row).not.toHaveProperty("address_line");
  expect(row).not.toHaveProperty("exact_latitude");
});

test("photo upload restrictions: only the listing's owner can write to its folder; bad types and sizes are rejected", async ({ request }) => {
  const { token: ownerToken, userId: ownerId } = await accessTokenOf(owner.context());
  const { token: renterToken, userId: renterId } = await accessTokenOf(renter.context());
  const png = { mimeType: "image/png", name: "x.png", body: PNG_BYTES };
  const REFUSED = [400, 401, 403];

  // A stranger cannot write into the owner's folder, nor into their own folder under someone else's listing.
  expect(REFUSED).toContain((await storageUpload(request, `${ownerId}/${listingId}/stranger-${RUN}.png`, { token: renterToken, ...png })).status());
  expect(REFUSED).toContain((await storageUpload(request, `${renterId}/${listingId}/stranger-${RUN}.png`, { token: renterToken, ...png })).status());
  // Visitors (public key only) cannot upload at all.
  expect(REFUSED).toContain((await storageUpload(request, `${ownerId}/${listingId}/anon-${RUN}.png`, png)).status());
  // Malformed paths are refused even for the owner.
  expect(REFUSED).toContain((await storageUpload(request, `${ownerId}/not-a-listing/a.png`, { token: ownerToken, ...png })).status());
  expect(REFUSED).toContain((await storageUpload(request, `${ownerId}/${listingId}/sub/a.png`, { token: ownerToken, ...png })).status());
  // Wrong types are refused even in the owner's own folder (storage policy and bucket MIME allow-list).
  for (const [name, mimeType] of [["page.html", "text/html"], ["pic.svg", "image/svg+xml"], ["pic.png.exe", "application/octet-stream"], ["pic.gif", "image/gif"]] as const) {
    const res = await storageUpload(request, `${ownerId}/${listingId}/${name}`, { token: ownerToken, mimeType, name, body: Buffer.from("x") });
    expect([400, 403, 415], name).toContain(res.status());
  }
  // Oversized files are refused by the bucket limit.
  const big = await storageUpload(request, `${ownerId}/${listingId}/big-${RUN}.png`, { token: ownerToken, mimeType: "image/png", name: "big.png", body: Buffer.alloc(5 * 1024 * 1024 + 10) });
  expect([400, 413]).toContain(big.status());
  // The owner can upload a valid image (and the file is then publicly readable).
  const ok = await storageUpload(request, `${ownerId}/${listingId}/ok-${RUN}.png`, { token: ownerToken, ...png });
  expect(ok.status()).toBe(200);
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "");
  expect((await request.get(`${base}/storage/v1/object/public/listing-photos/${ownerId}/${listingId}/ok-${RUN}.png`)).status()).toBe(200);
  // …and nothing from the refused attempts exists.
  expect((await request.get(`${base}/storage/v1/object/public/listing-photos/${ownerId}/${listingId}/stranger-${RUN}.png`)).status()).toBe(404);

  // The in-app uploader also rejects bad files before any network call.
  await owner.goto(`/dashboard/listings/${listingId}/edit`);
  await owner.getByRole("button", { name: /^3\.\s*Photos/ }).click();
  await owner.locator("#photo-input").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") });
  await expect(owner.getByText("Only JPEG, PNG or WebP images are allowed.")).toBeVisible();
  await owner.locator("#photo-input").setInputFiles({ name: "big.png", mimeType: "image/png", buffer: Buffer.alloc(5 * 1024 * 1024 + 10) });
  await expect(owner.getByText(/smaller than 5 MB/)).toBeVisible();
});

test("8. a user can sign out, stay signed out, and return to public pages safely", async () => {
  await third.goto("/dashboard");
  await expect(third.getByRole("heading", { name: /Welcome/ })).toBeVisible();
  await third.getByRole("button", { name: "Sign out" }).first().click();
  await expect(third).toHaveURL(/\/$/);
  await expect(third.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
  // Protected pages stay protected, including after navigating back.
  await third.goto("/dashboard/requests/mine");
  await expect(third).toHaveURL(/\/login\?next=/);
  await third.goBack();
  await third.goBack().catch(() => undefined);
  await third.goto("/dashboard");
  await expect(third).toHaveURL(/\/login/);
  const cookies = (await third.context().cookies()).filter((c) => c.name.startsWith("sb-") && c.value.length > 0 && /auth-token/.test(c.name));
  expect(cookies).toHaveLength(0);
  // Public pages still work for the signed-out user.
  await third.goto(`/listings/${listingId}`);
  await expect(third.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
});

test("owners can delete their listing, which then disappears everywhere", async ({ browser }) => {
  await owner.goto("/dashboard/listings");
  const row = owner.locator("li", { has: owner.getByRole("heading", { name: TITLE }) });
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await row.getByRole("button", { name: "Yes, delete" }).click();
  await expect(row.getByText("Listing deleted.")).toBeVisible({ timeout: 15_000 });
  await owner.reload();
  await expect(owner.getByRole("heading", { name: TITLE })).toHaveCount(0);
  const ctx = await browser.newContext();
  const visitor = await newPage(ctx);
  await visitor.goto(`/listings/${listingId}`);
  await expect(visitor.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
  await ctx.close();
});
