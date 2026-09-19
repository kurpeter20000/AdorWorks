import { test, expect } from "@playwright/test";
import type { BrowserContext } from "@playwright/test";
import { createTestUser, deleteTestUser, loginAndCaptureStorageState, createTestOrganisation, seedContract } from "./helpers";

/**
 * S05-13 / S12-01 / S12-02 / S12-03 — code review alone can't confirm real
 * responsive behavior (responsive Tailwind classes being present doesn't
 * prove a page actually fits a given width). Checks the one concrete,
 * objective failure mode: real horizontal overflow at a real viewport
 * width — not full visual/breakpoint testing, but a genuine live signal
 * no amount of reading the code could provide.
 *
 * Three viewport tiers, one shared set of priority journeys — mobile
 * (S12-01), tablet (S12-02), desktop (S12-03). Test users/orgs/contracts
 * are seeded once per file run (beforeAll/afterAll), not per viewport, so
 * three tiers don't mean three times the database churn against the
 * shared test project. Each authenticated user logs in for real exactly
 * once (loginAndCaptureStorageState) — every test then opens an
 * already-authenticated context from that captured state rather than
 * resubmitting the login form again, since login is rate-limited by
 * email (5 attempts/15 min) and this file alone would otherwise submit
 * it 20+ times against the same two test accounts.
 */
const VIEWPORTS = {
  mobile: { width: 360, height: 740 }, // a common small-Android width
  tablet: { width: 768, height: 1024 }, // iPad portrait
  desktop: { width: 1440, height: 900 },
} as const;

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "page content should not exceed the viewport width").toBeLessThanOrEqual(1); // 1px tolerance for subpixel rounding
}

test.describe("priority journeys — no horizontal overflow at any supported width", () => {
  let talent: { id: string; email: string };
  let employer: { id: string; email: string };
  let orgCleanup: () => Promise<void>;
  let contractId: string;
  let contractCleanup: () => Promise<void>;
  let talentStorageState: Awaited<ReturnType<BrowserContext["storageState"]>>;
  let employerStorageState: Awaited<ReturnType<BrowserContext["storageState"]>>;

  test.beforeAll(async ({ browser }) => {
    talent = await createTestUser("responsive-talent", "talent");
    const org = await createTestOrganisation("responsive-org");
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
    // createTestOrganisation's own cleanup deletes both the organisation
    // row and employer/rep's user record — nothing further needed for it.
    await orgCleanup();
    await deleteTestUser(talent.id);
  });

  for (const [tier, viewport] of Object.entries(VIEWPORTS)) {
    test.describe(`${tier} (${viewport.width}x${viewport.height})`, () => {
      test.use({ viewport });

      test("login page", async ({ page }) => {
        await page.goto("/login");
        await expectNoHorizontalOverflow(page);
      });

      test("signup page", async ({ page }) => {
        await page.goto("/signup");
        await expectNoHorizontalOverflow(page);
      });

      test("onboarding basics", async ({ browser, viewport }) => {
        const context = await browser.newContext({ storageState: talentStorageState, viewport });
        const page = await context.newPage();
        await page.goto("/onboarding/basics");
        await expectNoHorizontalOverflow(page);
        await context.close();
      });

      test("talent dashboard", async ({ browser, viewport }) => {
        const context = await browser.newContext({ storageState: talentStorageState, viewport });
        const page = await context.newPage();
        await page.goto("/dashboard");
        await expectNoHorizontalOverflow(page);
        await context.close();
      });

      test("opportunities listing", async ({ browser, viewport }) => {
        const context = await browser.newContext({ storageState: talentStorageState, viewport });
        const page = await context.newPage();
        await page.goto("/opportunities");
        await expectNoHorizontalOverflow(page);
        await context.close();
      });

      test("passport (own)", async ({ browser, viewport }) => {
        const context = await browser.newContext({ storageState: talentStorageState, viewport });
        const page = await context.newPage();
        await page.goto("/passport");
        await expectNoHorizontalOverflow(page);
        await context.close();
      });

      test("notifications", async ({ browser, viewport }) => {
        const context = await browser.newContext({ storageState: talentStorageState, viewport });
        const page = await context.newPage();
        await page.goto("/notifications");
        await expectNoHorizontalOverflow(page);
        await context.close();
      });

      test("contract detail", async ({ browser, viewport }) => {
        const context = await browser.newContext({ storageState: talentStorageState, viewport });
        const page = await context.newPage();
        await page.goto(`/contracts/${contractId}`);
        await expectNoHorizontalOverflow(page);
        await context.close();
      });

      test("employer dashboard", async ({ browser, viewport }) => {
        const context = await browser.newContext({ storageState: employerStorageState, viewport });
        const page = await context.newPage();
        await page.goto("/organisation");
        await expectNoHorizontalOverflow(page);
        await context.close();
      });

      test("new opportunity form", async ({ browser, viewport }) => {
        const context = await browser.newContext({ storageState: employerStorageState, viewport });
        const page = await context.newPage();
        await page.goto("/organisation/opportunities/new");
        await expectNoHorizontalOverflow(page);
        await context.close();
      });
    });
  }
});
