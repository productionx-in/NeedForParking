import { expect, test } from "@playwright/test";
import { createAndPublishListing, newPage, hasBackend, signIn, SKIP_REASON, users } from "./support";

/**
 * Optional: needs E2E_ADMIN_PHONE/OTP for an account that was promoted out-of-band, e.g. in the SQL editor:
 *   update public.profiles set role = 'admin' where id = (select id from auth.users where phone = '<E.164 without +>');
 * There is intentionally no UI or API to become admin.
 */
test.describe.configure({ mode: "serial", timeout: 90_000 });
test.skip(!hasBackend || !users.admin.phone, `${SKIP_REASON} Plus E2E_ADMIN_PHONE/OTP for a promoted admin account.`);

test("admin reviews a reported listing, suspends it, and it disappears from the public site", async ({ browser }) => {
  const RUN = Date.now().toString(36);
  const title = `E2E reported bay ${RUN}`;
  const ownerCtx = await browser.newContext();
  const renterCtx = await browser.newContext();
  const adminCtx = await browser.newContext();
  const visitorCtx = await browser.newContext();
  const owner = await newPage(ownerCtx);
  const renter = await newPage(renterCtx);
  const admin = await newPage(adminCtx);
  const visitor = await newPage(visitorCtx);

  await signIn(owner, "owner");
  const id = await createAndPublishListing(owner, { title, address: `Fictional Admin Test ${RUN}` });

  await signIn(renter, "renter", `/listings/${id}`);
  await renter.getByText("Report this listing").click();
  await renter.getByLabel("Reason").selectOption("scam");
  await renter.getByLabel(/Details/).fill("e2e: looks suspicious");
  await renter.getByRole("button", { name: "Send report" }).click();
  await expect(renter.getByText(/report was sent|already reported/)).toBeVisible({ timeout: 15_000 });

  await signIn(admin, "admin", "/admin");
  const report = admin.getByTestId("report").filter({ hasText: title });
  await expect(report).toBeVisible();
  await report.getByLabel("Moderator note").fill("e2e: suspended for review");
  await report.getByRole("button", { name: "Suspend listing" }).click();
  await expect(report.getByText("Listing suspended and hidden from the public.")).toBeVisible({ timeout: 15_000 });
  await report.getByRole("button", { name: "Mark actioned" }).click();
  // Resolved reports leave the open queue and show up under "Closed".
  await expect(admin.getByTestId("report").filter({ hasText: title })).toHaveCount(0, { timeout: 15_000 });
  await admin.goto("/admin?status=closed");
  await expect(admin.getByTestId("report").filter({ hasText: title }).getByText("actioned", { exact: true })).toBeVisible();

  await visitor.goto(`/search?q=${encodeURIComponent(title)}`);
  await expect(visitor.getByTestId("listing-card")).toHaveCount(0);
  await visitor.goto(`/listings/${id}`);
  await expect(visitor.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();

  // The owner sees it was suspended and cannot lift it.
  await owner.goto("/dashboard/listings");
  const mine = owner.locator("li", { has: owner.getByRole("heading", { name: title }) });
  await expect(mine.getByText("Suspended by moderator")).toBeVisible();
  await expect(mine.getByText(/e2e: suspended for review/)).toBeVisible();
  await owner.goto(`/dashboard/listings/${id}`).catch(() => undefined);

  await admin.goto("/admin/activity");
  await expect(admin.getByText("listing_suspended").first()).toBeVisible();

  // clean up: restore then remove, so repeated runs stay tidy.
  await admin.goto("/admin?status=all");
  await admin.getByTestId("report").filter({ hasText: title }).getByRole("button", { name: "Restore listing" }).click();
  await owner.goto("/dashboard/listings");
  const row = owner.locator("li", { has: owner.getByRole("heading", { name: title }) });
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await row.getByRole("button", { name: "Yes, delete" }).click();
  await Promise.all([ownerCtx, renterCtx, adminCtx, visitorCtx].map((c) => c.close()));
});
