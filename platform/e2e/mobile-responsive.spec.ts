import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser, loginAs } from "./helpers";

/**
 * S05-13 — code review alone can't confirm real mobile behavior
 * (responsive Tailwind classes being present doesn't prove a page
 * actually fits a narrow screen). Checks the one concrete, objective
 * failure mode: real horizontal overflow at a real narrow viewport —
 * not full visual/breakpoint testing, but a genuine live signal no
 * amount of reading the code could provide.
 */
const NARROW_VIEWPORT = { width: 360, height: 740 }; // a common small-Android width

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "page content should not exceed the viewport width").toBeLessThanOrEqual(1); // 1px tolerance for subpixel rounding
}

test.describe("mobile viewport — no horizontal overflow", () => {
  test.use({ viewport: NARROW_VIEWPORT });

  test("login page", async ({ page }) => {
    await page.goto("/login");
    await expectNoHorizontalOverflow(page);
  });

  test("signup page", async ({ page }) => {
    await page.goto("/signup");
    await expectNoHorizontalOverflow(page);
  });

  test("onboarding basics", async ({ page }) => {
    const talent = await createTestUser("mobiletalent", "talent");
    try {
      await loginAs(page, talent.email);
      await page.goto("/onboarding/basics");
      await expectNoHorizontalOverflow(page);
    } finally {
      await deleteTestUser(talent.id);
    }
  });

  test("passport (own)", async ({ page }) => {
    const talent = await createTestUser("mobilepassport", "talent");
    try {
      await loginAs(page, talent.email);
      await page.goto("/passport");
      await expectNoHorizontalOverflow(page);
    } finally {
      await deleteTestUser(talent.id);
    }
  });
});
