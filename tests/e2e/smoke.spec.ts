import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./support";

// These run with or without a configured backend.
test.describe("public pages @smoke", () => {
  for (const path of ["/", "/search", "/login"]) {
    test(`${path} renders, has landmarks, and does not overflow horizontally`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("main")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("banner")).toBeVisible();
      await expect(page.getByRole("contentinfo")).toContainText("research prototype");
      await expectNoHorizontalOverflow(page);
    });
  }

  test("no console errors or hydration mismatches on public pages", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
    page.on("response", (r) => r.status() >= 400 && !r.url().includes("_rsc") && problems.push(`HTTP ${r.status()} ${r.url()}`));
    for (const path of ["/", "/search", "/search?view=map", "/login"]) {
      await page.goto(path);
      await page.waitForSelector('html[data-hydrated="true"]');
    }
    expect(problems).toEqual([]);
  });

  test("keyboard: the first Tab stop is the skip link, and it jumps to main content", async ({ page, isMobile }) => {
    test.skip(isMobile, "keyboard navigation is a desktop concern");
    await page.goto("/search");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });

  test("login: country selector defaults to India (+91) and invalid input is explained", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Country")).toHaveValue("IN");
    await expect(page.getByRole("option", { name: /India \(\+91\)/ })).toBeAttached();
    await page.getByLabel(/Mobile number/).fill("123");
    await page.getByRole("button", { name: "Send code" }).click();
    // Either a validation message (backend configured) or a setup message (not configured) — never a fake "sent".
    await expect(page.getByRole("alert").or(page.locator("#phone-error")).first()).toBeVisible();
    await expect(page.getByText("Check your messages")).toHaveCount(0);
  });

  test("search page handles hostile query strings safely", async ({ page }) => {
    const res = await page.goto("/search?q=%27%3B%20drop%20table%20x%3B--&vehicle=bogus&page=-9&minPrice=abc&lat=999&sort=hax");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Find parking in Hyderabad" })).toBeVisible();
  });
});

test.describe("visitor restrictions (no backend needed)", () => {
  for (const path of ["/dashboard", "/dashboard/listings/new", "/dashboard/requests/incoming", "/dashboard/favorites", "/dashboard/account", "/admin"]) {
    test(`${path} redirects visitors to sign-in and remembers the destination`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path).replace(/%/g, "%")}`));
      await expect(page.getByRole("heading", { name: "Sign in or register" })).toBeVisible();
    });
  }
  test("open-redirect attempts via ?next are ignored", async ({ page }) => {
    await page.goto("/login?next=https://evil.example/phish");
    await expect(page.getByText(/taken back to where you were/)).toHaveCount(0);
  });
});
