import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import fs from "fs";
import path from "path";

function loadEnv() {
  const envPath = path.resolve(__dirname, "../.env.local");
  const raw = fs.readFileSync(envPath, "utf8");
  return Object.fromEntries(
    raw
      .split("\n")
      .filter((l) => l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
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
  await admin.from("profiles").update({ role }).eq("id", data.user.id);
  if (role === "talent") {
    await admin.from("talent_profiles").insert({ id: data.user.id, display_name: `E2E ${rolePrefix}` });
  }
  return { id: data.user.id, email };
}

export async function deleteTestUser(userId: string) {
  await admin.from("talent_profiles").delete().eq("id", userId);
  await admin.auth.admin.deleteUser(userId).catch(() => {});
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
    admin.from("organisations").insert({ name: `E2E Org ${stamp}`, representative_id: rep.id }).select("id").single(),
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

export async function loginAs(page: Page, email: string, password = TEST_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL("**/dashboard", { timeout: 20000 });
}
