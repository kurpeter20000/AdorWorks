import { test, expect } from "@playwright/test";
import { admin, createTestOrganisation, createTestUser, deleteTestUser, loginAs, seedTalentService } from "./helpers";

/**
 * S09-14: the service-to-contract journey (S09-03/04/05) had no test
 * coverage at all — these drive the real UI on both sides (employer
 * request, talent proposal, employer accept/decline) end to end.
 */
test.describe("service requests, proposals and contracts", () => {
  test("a full service-to-contract journey: request, propose, accept", async ({ browser }) => {
    // Two browser contexts each hitting several first-time-compiled routes
    // in dev mode — generous budget, same reasoning as this project's other
    // documented cold-start flakiness (see opportunity-lifecycle.spec.ts).
    test.setTimeout(150000);
    const org = await createTestOrganisation("servicejourney");
    await admin.from("organisations").update({ verification_status: "verified" }).eq("id", org.id);
    const talent = await createTestUser("servicejourneytalent", "talent");
    const serviceTitle = `E2E Journey Service ${Date.now()}`;
    const service = await seedTalentService(talent.id, { status: "published", published_at: new Date().toISOString(), title: serviceTitle });

    const employerContext = await browser.newContext();
    const employerPage = await employerContext.newPage();
    const talentContext = await browser.newContext();
    const talentPage = await talentContext.newPage();

    try {
      // Employer requests the service.
      await loginAs(employerPage, org.rep.email);
      await employerPage.goto(`/services?q=${encodeURIComponent(serviceTitle)}`);
      await employerPage.getByRole("button", { name: /request this service/i }).click();
      await employerPage.getByRole("button", { name: /send request/i }).click();
      await expect(employerPage.getByText(/requested — awaiting response/i)).toBeVisible({ timeout: 15000 });

      // Talent sees the request and sends a proposal.
      await loginAs(talentPage, talent.email);
      await talentPage.goto("/passport/services/requests");
      await expect(talentPage.getByText(serviceTitle)).toBeVisible();
      await talentPage.locator('input[name="price"]').fill("500");
      await talentPage.locator('input[name="timelineDays"]').fill("5");
      await talentPage.getByRole("button", { name: /send proposal/i }).click();
      await expect(talentPage.getByText(/proposal sent/i)).toBeVisible({ timeout: 15000 });

      // Employer accepts the proposal — creates a contract.
      await employerPage.goto("/organisation/service-requests");
      await expect(employerPage.getByText(/proposed: ssp 500/i)).toBeVisible({ timeout: 15000 });
      await employerPage.getByRole("button", { name: /^accept$/i }).click();
      await expect(employerPage.getByText(/accepted — check contracts/i)).toBeVisible({ timeout: 15000 });

      const { data: request } = await admin.from("service_requests").select("id, status").eq("talent_service_id", service.id).single();
      expect(request?.status).toBe("accepted");

      const { data: contract } = await admin.from("contracts").select("id, service_request_id, opportunity_id").eq("service_request_id", request!.id).maybeSingle();
      expect(contract).not.toBeNull();
      expect(contract?.opportunity_id).toBeNull();

      // Talent can see the resulting contract.
      await talentPage.goto(`/contracts/${contract!.id}`);
      await expect(talentPage.getByRole("heading", { name: new RegExp(serviceTitle) })).toBeVisible({ timeout: 15000 });
    } finally {
      await admin.from("contracts").delete().eq("service_request_id", (await admin.from("service_requests").select("id").eq("talent_service_id", service.id).maybeSingle()).data?.id ?? "");
      await admin.from("offers").delete().eq("talent_id", talent.id);
      await admin.from("service_requests").delete().eq("talent_service_id", service.id);
      await service.cleanup();
      await deleteTestUser(talent.id);
      await org.cleanup();
      await employerContext.close();
      await talentContext.close();
    }
  });

  test("a talent can decline a service request outright", async ({ page }) => {
    const org = await createTestOrganisation("servicedecline");
    await admin.from("organisations").update({ verification_status: "verified" }).eq("id", org.id);
    const talent = await createTestUser("servicedeclinetalent", "talent");
    const serviceTitle = `E2E Decline Service ${Date.now()}`;
    const service = await seedTalentService(talent.id, { status: "published", published_at: new Date().toISOString(), title: serviceTitle });

    const { data: request } = await admin
      .from("service_requests")
      .insert({ talent_service_id: service.id, organisation_id: org.id, talent_id: talent.id, requested_by: org.rep.id })
      .select("id")
      .single();

    try {
      await loginAs(page, talent.email);
      await page.goto("/passport/services/requests");
      await page.getByRole("button", { name: /decline this request/i }).click();
      await expect(page.getByText(/declined/i)).toBeVisible({ timeout: 15000 });

      const { data: updated } = await admin.from("service_requests").select("status").eq("id", request!.id).single();
      expect(updated?.status).toBe("declined");
    } finally {
      await admin.from("service_requests").delete().eq("id", request!.id);
      await service.cleanup();
      await deleteTestUser(talent.id);
      await org.cleanup();
    }
  });
});
