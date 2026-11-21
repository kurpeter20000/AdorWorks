import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser, loginAs, admin } from "./helpers";

/**
 * 0107 — the digitized personal-referral feature. Drives the real
 * browser flow end to end: a talent requests a vouch from an existing
 * account by email, that account confirms it, and it shows on the
 * talent's public Passport — the exact loop the feature exists for.
 */
test.describe("vouches", () => {
  test("a talent can request a vouch, the voucher confirms it, and it shows on the public profile", async ({ page, browser }) => {
    const talent = await createTestUser("vouchtalent", "talent");
    await admin.from("profiles").update({ full_name: "Vouch Talent E2E" }).eq("id", talent.id);
    await admin.from("talent_profiles").update({ display_name: "Vouch Talent E2E", public_visible: true }).eq("id", talent.id);
    const voucher = await createTestUser("voucher", "individual_client");
    await admin.from("profiles").update({ full_name: "Voucher E2E" }).eq("id", voucher.id);

    try {
      await loginAs(page, talent.email);
      await page.goto("/passport");
      await page.getByPlaceholder(/their email/i).fill(voucher.email);
      await page.getByPlaceholder(/how do you know them/i).fill("Former colleague");
      await page.getByRole("button", { name: /ask for a vouch/i }).click();
      await expect(page.getByText(/request sent/i)).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(/waiting/i)).toBeVisible();

      // A second, independent browser context for the voucher — this is
      // a different real account responding to a real notification, not
      // the same session acting on both sides.
      const voucherContext = await browser.newContext();
      const voucherPage = await voucherContext.newPage();
      await loginAs(voucherPage, voucher.email);
      await voucherPage.goto("/vouches");
      await expect(voucherPage.getByText("Vouch Talent E2E")).toBeVisible({ timeout: 10000 });
      await voucherPage.getByRole("button", { name: /^confirm$/i }).click();
      await expect(voucherPage.getByText(/confirmed/i).first()).toBeVisible({ timeout: 10000 });
      await voucherContext.close();

      // The public page shows the vouch itself but never the voucher's
      // real name — same anonymize-to-role pattern as reviews.
      await page.goto(`/passport/${talent.id}`);
      await expect(page.getByText("Former colleague")).toBeVisible({ timeout: 10000 });
      await expect(page.getByText("Voucher E2E")).not.toBeVisible();
    } finally {
      await admin.from("vouches").delete().eq("talent_id", talent.id);
      await deleteTestUser(talent.id);
      await deleteTestUser(voucher.id);
    }
  });

  test("a talent cannot request a vouch from someone with no AdorWorks account", async ({ page }) => {
    const talent = await createTestUser("vouchtalent2", "talent");

    try {
      await loginAs(page, talent.email);
      await page.goto("/passport");
      await page.getByPlaceholder(/their email/i).fill(`nobody-${Date.now()}@example.com`);
      await page.getByPlaceholder(/how do you know them/i).fill("Friend");
      await page.getByRole("button", { name: /ask for a vouch/i }).click();
      await expect(page.getByText(/doesn't have an AdorWorks account yet/i)).toBeVisible({ timeout: 10000 });
    } finally {
      await deleteTestUser(talent.id);
    }
  });
});
