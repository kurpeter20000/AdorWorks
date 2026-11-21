import { test, expect, type Page } from "@playwright/test";
import { admin, createTestOrganisation, createTestUser, deleteTestUser, loginAs, loginAsStaff, seedOpportunity } from "./helpers";

/**
 * End-to-end journeys for the November 2026 features: Fit check and the
 * application limit, the public Verify page, bank transfer from any bank,
 * shortlist review, Pathways join + session check-in, partner
 * self-service, and the wallet name check before a payout. Each test seeds
 * its own data in the TEST project and removes it afterwards.
 */

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>, label: string): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error || !data) throw new Error(`seed ${label}: ${error?.message ?? "no row"}`);
  return data as NonNullable<T>;
}

/** A verified employer, a talent, and an active contract between them with one milestone. */
async function seedEmployerContract(milestoneStatus: string) {
  const org = await createTestOrganisation("nfemployer");
  await admin.from("organisations").update({ verification_status: "verified" }).eq("id", org.id);
  const talent = await createTestUser("nftalent", "talent");
  const opp = await seedOpportunity(org.id, { status: "open" });
  const application = await must(admin.from("applications").insert({ opportunity_id: opp.id, talent_id: talent.id, source: "matched" }).select("id").single(), "application");
  const offer = await must(
    admin.from("offers").insert({ application_id: application.id, opportunity_id: opp.id, talent_id: talent.id, organisation_id: org.id, payment_basis: "fixed", compensation_amount: 100, status: "accepted", created_by: org.rep.id }).select("id").single(),
    "offer"
  );
  const contract = await must(
    admin.from("contracts").insert({ offer_id: offer.id, opportunity_id: opp.id, talent_id: talent.id, organisation_id: org.id, status: "active" }).select("id").single(),
    "contract"
  );
  const milestone = await must(
    admin.from("milestones").insert({ contract_id: contract.id, title: "E2E milestone", amount: 100, currency: "SSP", status: milestoneStatus }).select("id").single(),
    "milestone"
  );
  return {
    org,
    talent,
    contractId: contract.id as string,
    milestoneId: milestone.id as string,
    async cleanup() {
      await admin.from("payment_events").delete().eq("contract_id", contract.id);
      await admin.from("payment_intentions").delete().eq("contract_id", contract.id);
      await admin.from("finance_records").delete().eq("contract_id", contract.id);
      await admin.from("milestones").delete().eq("contract_id", contract.id);
      await admin.from("contract_terms").delete().eq("contract_id", contract.id);
      await admin.from("contract_signatures").delete().eq("contract_id", contract.id);
      await admin.from("work_history").delete().eq("contract_id", contract.id);
      await admin.from("contracts").delete().eq("id", contract.id);
      await admin.from("offers").delete().eq("id", offer.id);
      await admin.from("applications").delete().eq("id", application.id);
      await opp.cleanup();
      await deleteTestUser(talent.id);
      await org.cleanup();
    },
  };
}

async function withSetting<T>(key: string, value: unknown, fn: () => Promise<T>): Promise<T> {
  const { data: before } = await admin.from("platform_settings").select("value").eq("key", key).maybeSingle();
  await admin.from("platform_settings").upsert({ key, value });
  try {
    return await fn();
  } finally {
    if (before) await admin.from("platform_settings").upsert({ key, value: before.value });
    else await admin.from("platform_settings").delete().eq("key", key);
  }
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe("November 2026 features", () => {
  test("the apply page shows the Fit check and the 10-application allowance", async ({ page }) => {
    const org = await createTestOrganisation("nffit");
    await admin.from("organisations").update({ verification_status: "verified" }).eq("id", org.id);
    const talent = await createTestUser("nffittalent", "talent");
    await admin.from("talent_profiles").update({ skills: ["testing"] }).eq("id", talent.id);
    const opp = await seedOpportunity(org.id, { status: "open", skills: ["testing", "figma"] });
    try {
      await loginAs(page, talent.email);
      await page.goto(`/opportunities/${opp.id}/apply`);
      await expect(page.getByRole("heading", { name: /fit check/i })).toBeVisible();
      await expect(page.getByText(/^stretch$/i)).toBeVisible();
      await expect(page.getByText(/0 of 10 open applications used/i)).toBeVisible();
    } finally {
      await opp.cleanup();
      await deleteTestUser(talent.id);
      await org.cleanup();
    }
  });

  test("anyone can verify a talent's tier without seeing contact details", async ({ page }) => {
    const talent = await createTestUser("nfverify", "talent");
    await admin.from("talent_profiles").update({ verification_tier: "adorverified" }).eq("id", talent.id);
    try {
      await page.goto(`/verify/${talent.id}`);
      await expect(page.getByRole("heading", { name: /E2E nfverify/ })).toBeVisible();
      await expect(page.getByText("AdorVerified").first()).toBeVisible();
      await expect(page.getByText(talent.email)).toHaveCount(0);
      await page.setViewportSize({ width: 360, height: 740 });
      await noHorizontalScroll(page);
    } finally {
      await deleteTestUser(talent.id);
    }
  });

  test("an employer pays by bank transfer from any bank and finance confirms it", async ({ page, browser }) => {
    test.setTimeout(150000); // two sign-ins, one with the authenticator step
    const seed = await seedEmployerContract("approved");
    const finance = await createTestUser("nffinance", "finance");
    try {
      await withSetting("bank_account", { by_currency: { SSP: { bank_name: "Equity Bank", account_name: "AdorWorks", account_number: "100200300" } } }, async () => {
        await loginAs(page, seed.org.rep.email);
        await page.goto(`/contracts/${seed.contractId}`);
        await page.getByText("Bank transfer", { exact: true }).click();
        await page.getByRole("button", { name: /get bank details/i }).click();
        await expect(page.getByText(/waiting for your bank transfer/i)).toBeVisible({ timeout: 40000 });
        await expect(page.getByText("100200300")).toBeVisible();
        const intention = await must(admin.from("payment_intentions").select("transfer_reference").eq("contract_id", seed.contractId).single(), "intention");
        expect(intention.transfer_reference).toMatch(/^AWP-/);

        const staff = await browser.newPage();
        await loginAsStaff(staff, finance.email);
        await staff.goto("/operations/invoices");
        const row = staff.locator("li").filter({ hasText: intention.transfer_reference! });
        await row.getByPlaceholder(/statement reference/i).fill("EQ-STATEMENT-1");
        await row.getByRole("button", { name: /money received/i }).click();
        // Once confirmed, the transfer leaves the waiting list and the milestone is paid.
        await expect
          .poll(async () => (await admin.from("milestones").select("status").eq("id", seed.milestoneId).single()).data?.status, { timeout: 20000 })
          .toBe("paid");
        await expect(staff.locator("li").filter({ hasText: intention.transfer_reference! })).toHaveCount(0);
        await staff.close();
        const { data: pe } = await admin.from("payment_events").select("provider_name, received_into").eq("contract_id", seed.contractId).single();
        expect(pe?.provider_name).toBe("bank_transfer");
        expect(pe?.received_into).toContain("Equity Bank");
      });
    } finally {
      await seed.cleanup();
      await deleteTestUser(finance.id);
    }
  });

  test("an employer reviews a staff-built shortlist and moves someone to interview", async ({ page }) => {
    const org = await createTestOrganisation("nfshortlist");
    await admin.from("organisations").update({ verification_status: "verified" }).eq("id", org.id);
    const talent = await createTestUser("nfshorttalent", "talent");
    const opp = await seedOpportunity(org.id, { status: "open", shortlist_sent_at: new Date().toISOString() });
    const app = await must(
      admin.from("applications").insert({ opportunity_id: opp.id, talent_id: talent.id, source: "matched", stage: "shortlisted", reviewer_note: "Strong testing portfolio and available now." }).select("id").single(),
      "application"
    );
    try {
      await loginAs(page, org.rep.email);
      await page.goto(`/organisation/opportunities/${opp.id}`);
      const review = page.locator("#shortlist-review");
      await expect(review.getByText(/strong testing portfolio/i)).toBeVisible();
      await review.getByRole("button", { name: /^interview$/i }).click();
      await expect(review.getByText(/moved to interview/i)).toBeVisible({ timeout: 15000 });
      const { data } = await admin.from("applications").select("stage").eq("id", app.id).single();
      expect(data?.stage).toBe("interviewing");
    } finally {
      await admin.from("applications").delete().eq("id", app.id);
      await opp.cleanup();
      await deleteTestUser(talent.id);
      await org.cleanup();
    }
  });

  test("a participant joins a Pathways cohort with a code and checks in to a session", async ({ page }) => {
    const talent = await createTestUser("nfpathways", "talent");
    const stamp = Date.now().toString(36).toUpperCase().slice(-4);
    const programme = await must(
      admin.from("programmes").insert({ name: `E2E Cohort ${stamp}`, partner_name: "EduPower Youth Foundation", programme_type: "career_readiness", join_code: `E2E-${stamp}` }).select("id").single(),
      "programme"
    );
    await must(
      admin.from("programme_sessions").insert({ programme_id: programme.id, title: "CV workshop", starts_at: new Date().toISOString(), checkin_code: `IN-${stamp}` }).select("id").single(),
      "session"
    );
    try {
      await loginAs(page, talent.email);
      await page.goto(`/pathways/join?code=E2E-${stamp}`);
      await page.getByRole("button", { name: /join the programme/i }).click();
      await expect(page.getByText(/you've joined/i)).toBeVisible({ timeout: 15000 });

      await page.goto(`/pathways/checkin?code=IN-${stamp}`);
      await page.getByRole("button", { name: /^check in$/i }).click();
      await expect(page.getByText(/you're checked in/i)).toBeVisible({ timeout: 15000 });
      await page.getByRole("button", { name: /5 out of 5/i }).click();
      await expect(page.getByText(/thank you for your feedback/i)).toBeVisible();

      const { data: att } = await admin.from("programme_attendance").select("feedback_score").eq("talent_id", talent.id).single();
      expect(att?.feedback_score).toBe(5);
    } finally {
      await admin.from("programmes").delete().eq("id", programme.id);
      await deleteTestUser(talent.id);
    }
  });

  test("an approved partner creates its own cohort and gets a join code", async ({ page }) => {
    const org = await createTestOrganisation("nfpartner");
    await admin.from("organisations").update({ verification_status: "verified", is_programme_partner: true }).eq("id", org.id);
    try {
      await loginAs(page, org.rep.email);
      await expect(page.getByRole("link", { name: /programme dashboard/i })).toBeVisible({ timeout: 20000 });
      await page.goto("/partner");
      await page.getByRole("button", { name: /create a cohort/i }).click();
      await page.getByLabel(/cohort name/i).fill("E2E Partner Cohort");
      await page.getByRole("button", { name: /^create cohort$/i }).click();
      await page.waitForURL(/\/partner\/.+\/team/, { timeout: 15000 });
      await expect(page.getByRole("heading", { name: /how participants join/i })).toBeVisible();
      const { data } = await admin.from("programmes").select("join_code, partner_organisation_id").eq("partner_organisation_id", org.id).single();
      expect(data?.join_code).toMatch(/^[A-Z]{2,4}-[A-Z2-9]{4}$/);
      await expect(page.getByText(data!.join_code!)).toBeVisible();
    } finally {
      await admin.from("programmes").delete().eq("partner_organisation_id", org.id);
      await org.cleanup();
    }
  });

  test("finance checks the wallet name, then sends the talent's payout", async ({ page }) => {
    const seed = await seedEmployerContract("paid");
    const finance = await createTestUser("nfpayout", "finance");
    await admin.from("profiles").update({ full_name: "John Mayen Deng" }).eq("id", seed.talent.id);
    await admin.from("talent_payout_methods").upsert({ talent_id: seed.talent.id, method: "mtn_momo", phone: "+211912345678" });
    const pe = await must(
      admin
        .from("payment_events")
        .insert({ milestone_id: seed.milestoneId, contract_id: seed.contractId, external_reference: `e2e-${Date.now()}`, provider_name: "mtn_momo", amount: 100, net_amount: 100, total_charged: 100, currency: "SSP", status: "succeeded", escrow_status: "not_applicable" })
        .select("id")
        .single(),
      "payment"
    );
    try {
      await loginAsStaff(page, finance.email);
      await page.goto("/operations/payouts");
      const row = page.locator("li").filter({ hasText: /name check before the first payout/i }).filter({ hasText: "John Mayen Deng" });
      await row.getByPlaceholder(/name on the account/i).fill("DENG JOHN MAYEN");
      await row.getByRole("button", { name: /check name/i }).click();
      await expect(page.getByText(/name on account checked: DENG JOHN MAYEN/i)).toBeVisible({ timeout: 15000 });
      await page.getByRole("button", { name: /send by mtn momo/i }).first().click();
      await expect.poll(async () => (await admin.from("payment_events").select("disbursement_status").eq("id", pe.id).single()).data?.disbursement_status, { timeout: 15000 }).toBe("succeeded");
    } finally {
      await admin.from("talent_payout_methods").delete().eq("talent_id", seed.talent.id);
      await seed.cleanup();
      await deleteTestUser(finance.id);
    }
  });

  test("new public pages fit a small phone screen", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    for (const path of ["/phone?mode=signup", "/phone?mode=signin", "/verify/certificate/CERT-NOPE1234"]) {
      await page.goto(path);
      await noHorizontalScroll(page);
    }
  });
});
