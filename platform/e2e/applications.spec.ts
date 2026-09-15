import { test, expect } from "@playwright/test";
import { admin, createTestOrganisation, createTestUser, deleteTestUser, loginAs, seedOpportunity } from "./helpers";

/**
 * S08-14 gap-check (2026-09-15): no e2e or unit test touched apply/
 * withdraw/duplicate-prevention/late-application-blocking/drafts at all.
 * These drive the real UI as a signed-in talent, same pattern
 * opportunity-lifecycle.spec.ts already established for opportunities.
 */
test.describe("applications", () => {
  test("a talent can apply, sees a confirmation, and it appears in their applications list", async ({ page }) => {
    const org = await createTestOrganisation("applyhappy");
    await admin.from("organisations").update({ verification_status: "verified" }).eq("id", org.id);
    const talent = await createTestUser("applyhappytalent", "talent");
    const title = `E2E Apply Happy Path ${Date.now()}`;
    const opportunity = await seedOpportunity(org.id, { status: "open", title });

    try {
      await loginAs(page, talent.email);
      await page.goto(`/opportunities/${opportunity.id}/apply`);
      await expect(page.getByRole("heading", { name: new RegExp(title) })).toBeVisible();

      await page.getByLabel(/why are you a fit/i).fill("I have relevant experience for this exact role.");
      await page.getByRole("button", { name: /submit application/i }).click();

      await page.waitForURL("**/applications?applied=1", { timeout: 15000 });
      await expect(page.getByText(/your application was submitted/i)).toBeVisible();
      await expect(page.getByText(title)).toBeVisible();
    } finally {
      await opportunity.cleanup();
      await deleteTestUser(talent.id);
      await org.cleanup();
    }
  });

  test("a talent cannot apply twice to the same opportunity", async ({ page }) => {
    const org = await createTestOrganisation("applyduplicate");
    await admin.from("organisations").update({ verification_status: "verified" }).eq("id", org.id);
    const talent = await createTestUser("applyduptalent", "talent");
    const opportunity = await seedOpportunity(org.id, { status: "open" });

    try {
      await loginAs(page, talent.email);
      await page.goto(`/opportunities/${opportunity.id}/apply`);
      await page.getByLabel(/why are you a fit/i).fill("First attempt at applying to this role.");
      await page.getByRole("button", { name: /submit application/i }).click();
      await page.waitForURL("**/applications?applied=1", { timeout: 15000 });

      await page.goto(`/opportunities/${opportunity.id}/apply`);
      await page.getByLabel(/why are you a fit/i).fill("Second attempt — should be rejected.");
      await page.getByRole("button", { name: /submit application/i }).click();
      await expect(page.getByText(/already applied/i)).toBeVisible({ timeout: 15000 });
    } finally {
      await opportunity.cleanup();
      await deleteTestUser(talent.id);
      await org.cleanup();
    }
  });

  test("a talent cannot apply after the application deadline has passed", async ({ page }) => {
    // Simulates the exact gap S08-04 fixed: status is still 'open' (the
    // hourly expiry cron hasn't caught up yet), but the deadline is
    // already in the past.
    const org = await createTestOrganisation("applylate");
    await admin.from("organisations").update({ verification_status: "verified" }).eq("id", org.id);
    const talent = await createTestUser("applylatetalent", "talent");
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const opportunity = await seedOpportunity(org.id, { status: "open", application_deadline: yesterday });

    try {
      await loginAs(page, talent.email);
      await page.goto(`/opportunities/${opportunity.id}/apply`);
      await page.getByLabel(/why are you a fit/i).fill("Trying to apply after the deadline passed.");
      await page.getByRole("button", { name: /submit application/i }).click();
      await expect(page.getByText(/deadline.*passed/i)).toBeVisible({ timeout: 15000 });

      const { data } = await admin.from("applications").select("id").eq("opportunity_id", opportunity.id);
      expect(data ?? []).toHaveLength(0);
    } finally {
      await opportunity.cleanup();
      await deleteTestUser(talent.id);
      await org.cleanup();
    }
  });

  test("a saved draft is restored when the applicant returns", async ({ page }) => {
    const org = await createTestOrganisation("applydraft");
    await admin.from("organisations").update({ verification_status: "verified" }).eq("id", org.id);
    const talent = await createTestUser("applydrafttalent", "talent");
    const opportunity = await seedOpportunity(org.id, { status: "open" });
    const draftPitch = "A work in progress pitch I want to finish later.";

    try {
      await loginAs(page, talent.email);
      await page.goto(`/opportunities/${opportunity.id}/apply`);
      await page.getByLabel(/why are you a fit/i).fill(draftPitch);
      await page.getByRole("button", { name: /save draft/i }).click();
      await expect(page.getByText(/draft saved/i)).toBeVisible();

      await page.reload();
      await expect(page.getByLabel(/why are you a fit/i)).toHaveValue(draftPitch);

      const { data } = await admin.from("application_drafts").select("id").eq("opportunity_id", opportunity.id).eq("talent_id", talent.id);
      expect(data ?? []).toHaveLength(1);
    } finally {
      await admin.from("application_drafts").delete().eq("opportunity_id", opportunity.id);
      await opportunity.cleanup();
      await deleteTestUser(talent.id);
      await org.cleanup();
    }
  });

  test("withdrawing an application removes it from the active pipeline and can be reapplied to", async ({ page }) => {
    const org = await createTestOrganisation("applywithdraw");
    await admin.from("organisations").update({ verification_status: "verified" }).eq("id", org.id);
    const talent = await createTestUser("applywithdrawtalent", "talent");
    const title = `E2E Withdraw Flow ${Date.now()}`;
    const opportunity = await seedOpportunity(org.id, { status: "open", title });

    try {
      await loginAs(page, talent.email);
      await page.goto(`/opportunities/${opportunity.id}/apply`);
      await page.getByLabel(/why are you a fit/i).fill("Applying so I can withdraw and check the flow.");
      await page.getByRole("button", { name: /submit application/i }).click();
      await page.waitForURL("**/applications?applied=1", { timeout: 15000 });

      await page.getByRole("button", { name: /withdraw/i }).click();
      await expect(page.getByText(/withdrawn/i)).toBeVisible({ timeout: 15000 });

      const { data } = await admin.from("applications").select("stage").eq("opportunity_id", opportunity.id).eq("talent_id", talent.id).single();
      expect(data?.stage).toBe("withdrawn");
    } finally {
      await opportunity.cleanup();
      await deleteTestUser(talent.id);
      await org.cleanup();
    }
  });
});
