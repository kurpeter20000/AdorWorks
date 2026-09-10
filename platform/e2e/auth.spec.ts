import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser, loginAs, TEST_PASSWORD } from "./helpers";

test.describe("authentication", () => {
  test("rejects an incorrect password with a visible error, no redirect", async ({ page }) => {
    const user = await createTestUser("authfail", "talent");
    try {
      await page.goto("/login");
      await page.getByLabel(/email/i).fill(user.email);
      await page.getByLabel(/password/i).fill("definitely-the-wrong-password");
      await page.getByRole("button", { name: /sign in/i }).click();
      await expect(page.getByText(/incorrect email or password/i)).toBeVisible({ timeout: 10000 });
      expect(page.url()).toContain("/login");
    } finally {
      await deleteTestUser(user.id);
    }
  });

  test("logs in successfully with correct credentials and reaches the dashboard", async ({ page }) => {
    const user = await createTestUser("authok", "talent");
    try {
      await loginAs(page, user.email, TEST_PASSWORD);
      await expect(page).toHaveURL(/\/dashboard/);
      await expect(page.getByText(user.email)).toBeVisible();
    } finally {
      await deleteTestUser(user.id);
    }
  });

  test("signing out clears the session and blocks access to a protected page", async ({ page }) => {
    const user = await createTestUser("authout", "talent");
    try {
      await loginAs(page, user.email, TEST_PASSWORD);
      await page.getByRole("button", { name: /sign out/i }).click();
      await page.waitForURL("**/login", { timeout: 10000 });
      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/login/);
    } finally {
      await deleteTestUser(user.id);
    }
  });

  test("a session left idle past the inactivity window is signed out, not kept alive forever", async ({
    page,
    context,
  }) => {
    const user = await createTestUser("authidle", "talent");
    try {
      await loginAs(page, user.email, TEST_PASSWORD);

      // Backdate the proxy's own activity-tracking cookie (src/proxy.ts) to
      // simulate 31 minutes of inactivity — otherwise every request in this
      // test would itself refresh it, and the timeout could never trigger.
      const { hostname } = new URL(page.url());
      await context.addCookies([
        {
          name: "aw_last_active",
          value: String(Date.now() - 31 * 60 * 1000),
          domain: hostname,
          path: "/",
        },
      ]);

      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/login/);
    } finally {
      await deleteTestUser(user.id);
    }
  });
});
