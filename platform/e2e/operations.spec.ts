import { test, expect } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  loginAsStaff,
  seedDisputeWithSettledPayment,
  seedReport,
  seedOpportunity,
  createTestOrganisation,
  admin,
} from "./helpers";

/**
 * /operations is the one staff console (Stage 16 step: "One staff
 * console: move every /staff section into the app's /operations") —
 * the old static staff/ site is retired. This is its first e2e
 * coverage: real MFA-gated staff login through the browser, plus the
 * two authorization boundaries that mattered enough to be their own
 * line items historically (admin-only people management, finance-only
 * refunds — S14-04). loginAsStaff (helpers.ts) drives a fresh staff
 * account through real TOTP enrollment via /mfa-setup's own printed
 * manual-entry secret, not a fabricated aal2 claim.
 */
test.describe("operations console", () => {
  test("a staff account can sign in, complete real TOTP MFA, and reach /operations", async ({ page }) => {
    const staff = await createTestUser("opsadmin", "admin");
    try {
      await loginAsStaff(page, staff.email);
      await page.goto("/operations");
      await expect(page).toHaveURL(/\/operations/);
      await expect(page.getByRole("heading", { name: "Operations", level: 1 })).toBeVisible();
    } finally {
      await deleteTestUser(staff.id);
    }
  });

  test("a reviewer (not admin) cannot reach the admin-only people console", async ({ page }) => {
    const staff = await createTestUser("opsreviewer", "reviewer");
    try {
      await loginAsStaff(page, staff.email);
      await page.goto("/operations/people");
      // people/page.tsx renders this message server-side instead of the
      // PeopleConsole component when the session's role isn't admin —
      // never a redirect, so the URL stays on /operations/people.
      await expect(page.getByText(/admins only/i)).toBeVisible();
      await expect(page.getByText(/managing accounts and roles needs the admin role/i)).toBeVisible();
    } finally {
      await deleteTestUser(staff.id);
    }
  });

  test("a reviewer cannot refund a dispute's settled payment — S14-04", async ({ page }) => {
    const staff = await createTestUser("opsreviewer2", "reviewer");
    const talent = await createTestUser("disputetalent", "talent");
    const seed = await seedDisputeWithSettledPayment(talent.id);
    try {
      await loginAsStaff(page, staff.email);
      await page.goto("/operations/contracts");

      const row = page.getByRole("row", { name: new RegExp(seed.opportunityTitle) });
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.click();

      await page.getByLabel(/refund which milestone/i).selectOption(seed.milestoneId);

      // contracts-console.tsx confirms via window.confirm() before
      // calling the API, then surfaces the thrown error (the staff
      // API's real 403) through ActionStatus — capture both.
      page.on("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: /refund settled payment/i }).click();

      await expect(page.getByText(/finance.*access required/i)).toBeVisible({ timeout: 10000 });

      // The real point of this test: the payment must not actually have
      // been refunded, not just that some error text appeared.
      const { data: paymentAfter } = await admin.from("payment_events").select("status").eq("id", seed.paymentId).single();
      expect(paymentAfter?.status).toBe("succeeded");
    } finally {
      await seed.cleanup();
      await deleteTestUser(talent.id);
      await deleteTestUser(staff.id);
    }
  });

  test("a finance staff member can refund a dispute's settled payment", async ({ page }) => {
    const staff = await createTestUser("opsfinance", "finance");
    const talent = await createTestUser("disputetalent2", "talent");
    const seed = await seedDisputeWithSettledPayment(talent.id);
    try {
      await loginAsStaff(page, staff.email);
      await page.goto("/operations/contracts");

      const row = page.getByRole("row", { name: new RegExp(seed.opportunityTitle) });
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.click();

      await page.getByLabel(/refund which milestone/i).selectOption(seed.milestoneId);
      page.on("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: /refund settled payment/i }).click();

      await expect(page.getByText(/refund recorded/i)).toBeVisible({ timeout: 10000 });
      const { data: paymentAfter } = await admin.from("payment_events").select("status").eq("id", seed.paymentId).single();
      expect(paymentAfter?.status).toBe("refunded");
    } finally {
      await seed.cleanup();
      await deleteTestUser(talent.id);
      await deleteTestUser(staff.id);
    }
  });

  test("a staff member can set a report's severity and resolve it with notes", async ({ page }) => {
    const staff = await createTestUser("opsreports", "reviewer");
    const org = await createTestOrganisation("reportorg");
    const opportunity = await seedOpportunity(org.id);
    const report = await seedReport(org.rep.id, opportunity.id);
    try {
      await loginAsStaff(page, staff.email);
      await page.goto("/operations/reports");

      const row = page.getByRole("row", { name: new RegExp(opportunity.id) });
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.click();

      await page.getByLabel(/severity/i).selectOption("high");
      await page.getByRole("button", { name: /set severity/i }).click();
      await expect(page.getByText(/severity set/i)).toBeVisible({ timeout: 10000 });

      await page.getByLabel(/what did you do, and why/i).fill("Checked the listing, it was a genuine duplicate post. Dismissing.");
      await page.getByRole("button", { name: /^dismiss$/i }).click();
      await expect(page.getByText(/^updated\.?$/i)).toBeVisible({ timeout: 10000 });

      const { data: reportAfter } = await admin.from("reports").select("status, severity").eq("id", report.id).single();
      expect(reportAfter?.status).toBe("dismissed");
      expect(reportAfter?.severity).toBe("high");
    } finally {
      await report.cleanup();
      await opportunity.cleanup();
      await org.cleanup();
      await deleteTestUser(staff.id);
    }
  });

  test("resolving a report without notes is blocked client-side", async ({ page }) => {
    const staff = await createTestUser("opsreports2", "reviewer");
    const org = await createTestOrganisation("reportorg2");
    const opportunity = await seedOpportunity(org.id);
    const report = await seedReport(org.rep.id, opportunity.id);
    try {
      await loginAsStaff(page, staff.email);
      await page.goto("/operations/reports");

      const row = page.getByRole("row", { name: new RegExp(opportunity.id) });
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.click();

      // No notes typed — reports-console.tsx's resolve() refuses to call
      // the API at all below 5 characters.
      await page.getByRole("button", { name: /^dismiss$/i }).click();
      await expect(page.getByText(/say what you did and why/i)).toBeVisible();

      const { data: reportAfter } = await admin.from("reports").select("status").eq("id", report.id).single();
      expect(reportAfter?.status).toBe("open");
    } finally {
      await report.cleanup();
      await opportunity.cleanup();
      await org.cleanup();
      await deleteTestUser(staff.id);
    }
  });
});
