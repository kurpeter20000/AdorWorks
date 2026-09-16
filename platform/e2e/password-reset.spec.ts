import { test, expect } from "@playwright/test";
import { admin, createTestUser, deleteTestUser } from "./helpers";

/**
 * Regression test for a critical live bug (2026-09-16): every password-
 * reset (and signup-confirmation) email link redirected to
 * /auth/callback with the session delivered as a URL **fragment**
 * (#access_token=...) rather than a ?code= query param. /auth/callback
 * was a server Route Handler, which can never see a URL fragment at all
 * (browsers never send it to the server) — so `code` was always null and
 * every link silently failed, landing on /login?error=confirmation_failed.
 * This drives the real link exactly as Supabase sends it (via
 * admin.generateLink, the same underlying mechanism as
 * resetPasswordForEmail) through a real browser, end to end.
 */
test("a real password-reset email link actually lets the user set a new password", async ({ page }) => {
  const talent = await createTestUser("resetfixverify", "talent");

  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: talent.email,
      options: { redirectTo: "http://localhost:3000/auth/callback?next=%2Freset-password" },
    });
    expect(error).toBeNull();
    if (!data?.properties) throw new Error("generateLink returned no data");
    const actionLink = data.properties.action_link;

    // Click the link exactly as a user would — Supabase's own server
    // redirects the browser from here to our /auth/callback.
    await page.goto(actionLink);

    await page.waitForURL("**/reset-password", { timeout: 15000 });
    await expect(page.getByRole("heading", { name: /set a new password/i })).toBeVisible();

    const newPassword = "BrandNewPass123";
    await page.getByLabel(/new password/i).fill(newPassword);
    await page.getByRole("button", { name: /set new password/i }).click();
    await page.waitForURL("**/dashboard", { timeout: 15000 });

    // Confirm the new password actually works for a real login, not just
    // that the form appeared to succeed.
    await page.getByRole("button", { name: /sign out/i }).click();
    await page.waitForURL("**/login", { timeout: 15000 });
    await page.getByLabel(/email/i).fill(talent.email);
    await page.getByLabel(/password/i).fill(newPassword);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForURL("**/dashboard", { timeout: 15000 });
  } finally {
    await deleteTestUser(talent.id);
  }
});

/**
 * Same bug, same fix — signup email confirmation goes through the exact
 * same /auth/callback and the exact same hash-fragment delivery.
 */
test("a real signup-confirmation email link actually signs the user in", async ({ page }) => {
  const email = `e2e-confirmfix-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: "InitialPass123",
    email_confirm: false,
    user_metadata: { intended_role: "individual_client" },
  });
  expect(createError).toBeNull();
  if (!created?.user) throw new Error("createUser returned no data");

  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "signup",
      email,
      password: "InitialPass123",
      options: { redirectTo: "http://localhost:3000/auth/callback?next=%2Forganisation" },
    });
    expect(error).toBeNull();
    if (!data?.properties) throw new Error("generateLink returned no data");

    await page.goto(data.properties.action_link);
    await page.waitForURL(/\/organisation(\/setup)?$/, { timeout: 15000 });
  } finally {
    await deleteTestUser(created.user.id);
  }
});
