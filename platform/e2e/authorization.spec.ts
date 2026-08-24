import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser, seedContract, loginAs } from "./helpers";

/**
 * Security-focused: this exercises the DAL/RLS authorization boundary
 * directly, not just app-level UI gating. Every RLS bug this project has
 * hit historically (see platform/README.md's "Security notes") was found
 * by manual live testing — this gives that same class of check automated
 * regression coverage instead of relying on someone remembering to retest
 * it by hand.
 */
test.describe("authorization boundaries", () => {
  test("a talent cannot view a contract that belongs to a different talent", async ({ page }) => {
    const owner = await createTestUser("ownertalent", "talent");
    const intruder = await createTestUser("intrudertalent", "talent");
    const contract = await seedContract(owner.id);

    try {
      await loginAs(page, intruder.email);
      const response = await page.goto(`/contracts/${contract.contractId}`);
      // The DAL calls Next's notFound() for a non-participant — expect a
      // 404, and in no case the owner's contract details leaking through.
      expect(response?.status()).toBe(404);
      await expect(page.getByText(/E2E Opportunity/)).not.toBeVisible();
    } finally {
      await contract.cleanup();
      await deleteTestUser(owner.id);
      await deleteTestUser(intruder.id);
    }
  });

  test("an unauthenticated visitor is redirected to login when requesting a contract page directly", async ({ page }) => {
    const owner = await createTestUser("anonowner", "talent");
    const contract = await seedContract(owner.id);

    try {
      await page.goto(`/contracts/${contract.contractId}`);
      await expect(page).toHaveURL(/\/login/);
    } finally {
      await contract.cleanup();
      await deleteTestUser(owner.id);
    }
  });

  test("a talent cannot reach the organisation-only opportunity posting page", async ({ page }) => {
    const talent = await createTestUser("wrongrole", "talent");
    try {
      await loginAs(page, talent.email);
      await page.goto("/organisation/opportunities/new");
      // requireOrganisationMembership() redirects a non-member away —
      // the talent must not land on (or stay on) the posting form.
      await expect(page).not.toHaveURL(/\/organisation\/opportunities\/new/);
    } finally {
      await deleteTestUser(talent.id);
    }
  });
});
