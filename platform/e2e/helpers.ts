import { createClient } from "@supabase/supabase-js";
import type { Browser, Page } from "@playwright/test";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { validateE2EEnvironment, type E2EEnvironment } from "../src/lib/testing/e2e-environment";

function loadEnv() {
  const envPath = path.resolve(__dirname, "../.env.e2e.local");
  const fileEnvironment: E2EEnvironment = fs.existsSync(envPath)
    ? Object.fromEntries(
        fs
          .readFileSync(envPath, "utf8")
          .split("\n")
          .filter((line) => line.includes("=") && !line.trimStart().startsWith("#"))
          .map((line) => {
            const separator = line.indexOf("=");
            return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
          })
      )
    : {};

  return validateE2EEnvironment({
    ...fileEnvironment,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? fileEnvironment.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? fileEnvironment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY ?? fileEnvironment.SUPABASE_SECRET_KEY,
    E2E_ALLOW_MUTATIONS: process.env.E2E_ALLOW_MUTATIONS ?? fileEnvironment.E2E_ALLOW_MUTATIONS,
    E2E_EXPECTED_SUPABASE_PROJECT_REF:
      process.env.E2E_EXPECTED_SUPABASE_PROJECT_REF ?? fileEnvironment.E2E_EXPECTED_SUPABASE_PROJECT_REF,
  });
}

export const env = loadEnv();

export const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export const TEST_PASSWORD = "E2ETestPass1234";

export async function createTestUser(rolePrefix: string, role: string) {
  const email = `e2e-${rolePrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: TEST_PASSWORD, email_confirm: true });
  if (error || !data.user) throw new Error(`Failed to create test user: ${error?.message}`);
  const { error: roleError } = await admin.from("profiles").update({ role }).eq("id", data.user.id);
  if (roleError) {
    await admin.auth.admin.deleteUser(data.user.id).catch(() => {});
    throw new Error(`Failed to assign test role: ${roleError.message}`);
  }
  if (role === "talent") {
    const { error: profileError } = await admin
      .from("talent_profiles")
      .insert({ id: data.user.id, display_name: `E2E ${rolePrefix}` });
    if (profileError) {
      await admin.auth.admin.deleteUser(data.user.id).catch(() => {});
      throw new Error(`Failed to create test talent profile: ${profileError.message}`);
    }
  }
  return { id: data.user.id, email };
}

/**
 * Deleting a user fails with a generic "Database error deleting user"
 * whenever any row still references their profile with a blocking FK —
 * normally a real cleanup bug. Confirmed live (Stage 16 step 3) this can
 * also happen with zero such rows actually left, reproducing only when
 * running the full spec sequentially (never a test in isolation) — load
 * on the shared test project, not anything a caller did wrong. A real
 * leftover-reference bug fails identically on every attempt; this backs
 * off across a few to absorb a transient one instead.
 */
export async function deleteTestUser(userId: string) {
  let lastError: { message: string } | null = null;
  for (const delayMs of [0, 2000, 5000, 10000]) {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (!error) return;
    lastError = error;
  }
  throw new Error(`Failed to delete test user: ${lastError!.message}`);
}

async function mustInsert<T extends { id: string }>(
  result: PromiseLike<{ data: T | null; error: { message: string } | null }>,
  label: string
): Promise<T> {
  const { data, error } = await result;
  if (error || !data) throw new Error(`e2e seed failed inserting ${label}: ${error?.message ?? "no row returned"}`);
  return data;
}

/** Seeds a minimal active contract between a fresh org rep and the given talent. Returns everything needed for cleanup. */
export async function seedContract(talentId: string) {
  const stamp = Date.now();
  const rep = await createTestUser("contractrep", "individual_client");

  const org = await mustInsert(
    // S06-04 (0071): publishing an opportunity now requires a verified
    // organisation, enforced unconditionally at the trigger level — this
    // helper seeds one straight to 'open' below, so it must be verified
    // up front.
    admin.from("organisations").insert({ name: `E2E Org ${stamp}`, representative_id: rep.id, verification_status: "verified" }).select("id").single(),
    "organisation"
  );

  const opportunity = await mustInsert(
    admin
      .from("opportunities")
      .insert({
        organisation_id: org.id,
        type: "project",
        title: `E2E Opportunity ${stamp}`,
        category: "digital_technology",
        skills: ["testing"],
        work_mode: "remote",
        engagement_type: "freelance",
        payment_basis: "fixed",
        compensation_amount: 100,
        currency: "SSP",
        visibility: "public",
        status: "open",
      })
      .select("id")
      .single(),
    "opportunity"
  );

  const application = await mustInsert(
    admin.from("applications").insert({ opportunity_id: opportunity.id, talent_id: talentId, source: "matched" }).select("id").single(),
    "application"
  );

  const offer = await mustInsert(
    admin
      .from("offers")
      .insert({
        application_id: application.id,
        opportunity_id: opportunity.id,
        talent_id: talentId,
        organisation_id: org.id,
        payment_basis: "fixed",
        compensation_amount: 100,
        status: "accepted",
        created_by: rep.id,
      })
      .select("id")
      .single(),
    "offer"
  );

  const contract = await mustInsert(
    admin
      .from("contracts")
      .insert({ offer_id: offer.id, opportunity_id: opportunity.id, talent_id: talentId, organisation_id: org.id, status: "active" })
      .select("id")
      .single(),
    "contract"
  );

  return {
    contractId: contract.id as string,
    async cleanup() {
      await admin.from("contracts").delete().eq("id", contract.id);
      await admin.from("offers").delete().eq("id", offer.id);
      await admin.from("applications").delete().eq("id", application.id);
      await admin.from("opportunities").delete().eq("id", opportunity.id);
      await admin.from("organisations").delete().eq("id", org.id);
      await deleteTestUser(rep.id);
    },
  };
}

/**
 * A real, RLS-scoped client authenticated as a test user — for asserting
 * the database boundary (RLS + guard triggers) directly rejects an
 * illegal request, the same way a browser client bypassing the app's own
 * UI/server actions would be rejected. This is a stronger check than
 * driving the browser: it proves the boundary holds regardless of which
 * client makes the request, not just that our own UI doesn't offer the
 * button.
 */
export async function createUserClient(email: string, password = TEST_PASSWORD) {
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Failed to sign in test user ${email}: ${error.message}`);
  return client;
}

/** A fresh organisation with its own representative, for tenant-isolation tests. */
export async function createTestOrganisation(rolePrefix: string) {
  const rep = await createTestUser(rolePrefix, "individual_client");
  const org = await mustInsert(
    admin.from("organisations").insert({ name: `E2E Org ${rolePrefix} ${Date.now()}`, representative_id: rep.id }).select("id").single(),
    "organisation"
  );
  return {
    id: org.id as string,
    rep,
    async cleanup() {
      await admin.from("organisations").delete().eq("id", org.id);
      await deleteTestUser(rep.id);
    },
  };
}

/** Defaults to a complete, review-ready opportunity — override individual fields to test a specific gap. */
export async function seedOpportunity(organisationId: string, overrides: Record<string, unknown> = {}) {
  const opportunity = await mustInsert<{ id: string }>(
    admin
      .from("opportunities")
      .insert({
        organisation_id: organisationId,
        type: "project",
        title: `E2E Opportunity ${Date.now()}`,
        category: "digital_technology",
        skills: ["testing"],
        work_mode: "remote",
        engagement_type: "freelance",
        payment_basis: "fixed",
        compensation_amount: 100,
        currency: "SSP",
        visibility: "public",
        status: "pending_review",
        ...overrides,
      })
      .select("id")
      .single(),
    "opportunity"
  );
  return {
    id: opportunity.id,
    async cleanup() {
      await admin.from("opportunities").delete().eq("id", opportunity.id);
    },
  };
}

/** Defaults to a complete, review-ready talent_services row — override individual fields to test a specific gap. */
export async function seedTalentService(talentId: string, overrides: Record<string, unknown> = {}) {
  const service = await mustInsert<{ id: string }>(
    admin
      .from("talent_services")
      .insert({
        talent_id: talentId,
        title: `E2E Service ${Date.now()}`,
        category: "digital_technology",
        deliverables: "A thing worth paying for",
        payment_basis: "fixed",
        price: 50,
        currency: "SSP",
        status: "pending_review",
        ...overrides,
      })
      .select("id")
      .single(),
    "talent_service"
  );
  return {
    id: service.id,
    async cleanup() {
      await admin.from("talent_services").delete().eq("id", service.id);
    },
  };
}

export async function loginAs(page: Page, email: string, password = TEST_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL("**/dashboard", { timeout: 20000 });
}

/** RFC 4648 base32 decode (no padding needed — Supabase's manual-entry secrets never have any). */
function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const char of clean) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/** RFC 6238 TOTP (SHA-1, 30s step, 6 digits) — the universal authenticator-app default, matching /mfa-setup's QR. */
function totpCode(secret: string, atMs = Date.now()): string {
  const key = base32Decode(secret);
  const counter = Math.floor(atMs / 1000 / 30);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const truncated =
    ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return (truncated % 1_000_000).toString().padStart(6, "0");
}

/**
 * Staff roles (reviewer/matcher/finance/admin) are gated behind mandatory
 * TOTP MFA (S04-08, lib/dal/session.ts's requireStaffMfa) before reaching
 * anything past /mfa-setup or /mfa-challenge — no existing e2e spec drove
 * a staff login through the browser at all before Stage 16 step 3's
 * /operations/support, which is exactly why this gap had gone
 * unexercised. /mfa-setup prints its TOTP secret as plain text (the
 * "can't scan it" manual-entry code) specifically so a user without a
 * camera can type it in — this reads that same text and computes a real
 * code from it instead of trying to drive a QR scanner.
 */
export async function loginAsStaff(page: Page, email: string, password = TEST_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/mfa-(setup|challenge)/, { timeout: 20000 });

  if (page.url().includes("/mfa-setup")) {
    const secret = await page.getByText(/^[A-Z2-7]{16,}$/).textContent();
    if (!secret) throw new Error("Could not read the MFA manual-entry secret off /mfa-setup");
    await page.getByLabel(/6-digit code/i).fill(totpCode(secret.trim()));
    await page.getByRole("button", { name: /verify/i }).click();
  } else {
    // Already enrolled from an earlier session in this test run — needs
    // the secret again, which /mfa-challenge doesn't display; re-enrolling
    // isn't an option here, so this path is left for a future need.
    throw new Error("loginAsStaff hit /mfa-challenge (already enrolled) — not yet supported, use a fresh staff user per test");
  }

  await page.waitForURL("**/dashboard", { timeout: 20000 });
}

/**
 * Login is rate-limited by email — 5 attempts per 15 minutes
 * (lib/domain/rateLimit.ts), on purpose, to slow down password
 * guessing. A spec that calls loginAs() fresh for every single test
 * against the same test user (e.g. one user, six pages, three
 * viewports) blows straight through that limit and the later logins
 * silently fail — found live running mobile-responsive.spec.ts's own
 * expansion, not assumed.
 *
 * The fix: log in for real exactly once per user per file, capture the
 * resulting session as Playwright storage state, and hand every other
 * test an already-authenticated browser context built from it instead
 * of resubmitting the login form again. One real login still proves the
 * flow works (and auth.spec.ts covers that end to end already); this is
 * for every OTHER test that just needs to already be signed in.
 */
export async function loginAndCaptureStorageState(browser: Browser, email: string, password = TEST_PASSWORD) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAs(page, email, password);
  const storageState = await context.storageState();
  await context.close();
  return storageState;
}
