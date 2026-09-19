import { test, expect } from "@playwright/test";
import type { BrowserContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createTestUser, deleteTestUser, loginAndCaptureStorageState, createTestOrganisation, seedContract } from "./helpers";

/**
 * S12-07 / S12-06 / S12-09 — code review alone can't confirm real WCAG
 * conformance (a contrast ratio computed by hand, or an aria-label that
 * looks right, doesn't prove what a real browser's accessibility tree
 * exposes). axe-core scans the actual rendered DOM of each priority page
 * for real WCAG 2.1/2.2 AA violations — the same rule engine screen
 * readers and browser extensions like axe DevTools use.
 *
 * Shares the same seeded-once-per-file-run users as mobile-responsive.
 * spec.ts, and the same storage-state-reuse pattern to avoid tripping
 * the per-email login rate limit (see loginAndCaptureStorageState's own
 * comment in helpers.ts).
 */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

async function expectNoAccessibilityViolations(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} node(s)`).join("\n");
  expect(results.violations, `axe-core WCAG AA violations:\n${summary}`).toEqual([]);
}

test.describe("priority pages — no WCAG 2.1/2.2 AA violations", () => {
  let talent: { id: string; email: string };
  let employer: { id: string; email: string };
  let orgCleanup: () => Promise<void>;
  let contractId: string;
  let contractCleanup: () => Promise<void>;
  let talentStorageState: Awaited<ReturnType<BrowserContext["storageState"]>>;
  let employerStorageState: Awaited<ReturnType<BrowserContext["storageState"]>>;

  test.beforeAll(async ({ browser }) => {
    talent = await createTestUser("a11y-talent", "talent");
    const org = await createTestOrganisation("a11y-org");
    employer = org.rep;
    orgCleanup = org.cleanup;
    const contract = await seedContract(talent.id);
    contractId = contract.contractId;
    contractCleanup = contract.cleanup;

    talentStorageState = await loginAndCaptureStorageState(browser, talent.email);
    employerStorageState = await loginAndCaptureStorageState(browser, employer.email);
  });

  test.afterAll(async () => {
    await contractCleanup();
    await orgCleanup();
    await deleteTestUser(talent.id);
  });

  test("login page", async ({ page }) => {
    await page.goto("/login");
    await expectNoAccessibilityViolations(page);
  });

  test("signup page", async ({ page }) => {
    await page.goto("/signup");
    await expectNoAccessibilityViolations(page);
  });

  test("talent dashboard", async ({ browser }) => {
    const context = await browser.newContext({ storageState: talentStorageState });
    const page = await context.newPage();
    await page.goto("/dashboard");
    await expectNoAccessibilityViolations(page);
    await context.close();
  });

  test("opportunities listing", async ({ browser }) => {
    const context = await browser.newContext({ storageState: talentStorageState });
    const page = await context.newPage();
    await page.goto("/opportunities");
    await expectNoAccessibilityViolations(page);
    await context.close();
  });

  test("passport (own)", async ({ browser }) => {
    const context = await browser.newContext({ storageState: talentStorageState });
    const page = await context.newPage();
    await page.goto("/passport");
    await expectNoAccessibilityViolations(page);
    await context.close();
  });

  test("notifications", async ({ browser }) => {
    const context = await browser.newContext({ storageState: talentStorageState });
    const page = await context.newPage();
    await page.goto("/notifications");
    await expectNoAccessibilityViolations(page);
    await context.close();
  });

  test("contract detail", async ({ browser }) => {
    const context = await browser.newContext({ storageState: talentStorageState });
    const page = await context.newPage();
    await page.goto(`/contracts/${contractId}`);
    await expectNoAccessibilityViolations(page);
    await context.close();
  });

  test("employer dashboard", async ({ browser }) => {
    const context = await browser.newContext({ storageState: employerStorageState });
    const page = await context.newPage();
    await page.goto("/organisation");
    await expectNoAccessibilityViolations(page);
    await context.close();
  });

  test("new opportunity form", async ({ browser }) => {
    const context = await browser.newContext({ storageState: employerStorageState });
    const page = await context.newPage();
    await page.goto("/organisation/opportunities/new");
    await expectNoAccessibilityViolations(page);
    await context.close();
  });
});
