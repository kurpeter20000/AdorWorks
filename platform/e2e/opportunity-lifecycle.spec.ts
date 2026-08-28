import { test, expect } from "@playwright/test";
import {
  admin,
  createTestOrganisation,
  createTestUser,
  createUserClient,
  deleteTestUser,
  seedOpportunity,
  seedTalentService,
} from "./helpers";

/**
 * Stage 3 correction (playbook gap: "invalid transitions and tenant
 * leakage are tested"). These bypass the app's own UI/server actions
 * entirely and hit the database directly as an authenticated test user —
 * proving guard_opportunities_update/guard_talent_services_update (0041/
 * 0042/0043) and RLS reject an illegal request regardless of which client
 * makes it, not just that our own forms don't offer the button.
 */
test.describe("opportunity and service status transitions", () => {
  test("a non-staff org member cannot move an opportunity directly to 'open'", async ({}) => {
    const org = await createTestOrganisation("openbypass");
    const opportunity = await seedOpportunity(org.id); // defaults to a complete pending_review row
    try {
      const asRep = await createUserClient(org.rep.email);
      const { error } = await asRep.from("opportunities").update({ status: "open" }).eq("id", opportunity.id);
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/only staff/i);
    } finally {
      await opportunity.cleanup();
      await org.cleanup();
    }
  });

  test("a non-staff org member cannot submit an incomplete opportunity for review", async ({}) => {
    const org = await createTestOrganisation("incompletebrief");
    // A draft missing engagement_type/payment_basis/budget — exactly what
    // createProjectBrief leaves for the employer to finish later.
    const opportunity = await seedOpportunity(org.id, {
      status: "draft",
      engagement_type: null,
      payment_basis: null,
      compensation_amount: null,
    });
    try {
      const asRep = await createUserClient(org.rep.email);
      const { error } = await asRep.from("opportunities").update({ status: "pending_review" }).eq("id", opportunity.id);
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/missing required details/i);
    } finally {
      await opportunity.cleanup();
      await org.cleanup();
    }
  });

  test("an org member cannot read or modify another organisation's opportunity", async ({}) => {
    const orgA = await createTestOrganisation("tenantownerA");
    const orgB = await createTestOrganisation("tenantownerB");
    const opportunity = await seedOpportunity(orgA.id);
    try {
      const asRepB = await createUserClient(orgB.rep.email);

      const { data: readResult } = await asRepB.from("opportunities").select("id").eq("id", opportunity.id);
      expect(readResult ?? []).toHaveLength(0);

      await asRepB.from("opportunities").update({ title: "hijacked" }).eq("id", opportunity.id);
      const { data: stillOriginal } = await admin.from("opportunities").select("title").eq("id", opportunity.id).single();
      expect(stillOriginal?.title).not.toBe("hijacked");
    } finally {
      await opportunity.cleanup();
      await orgA.cleanup();
      await orgB.cleanup();
    }
  });

  test("a talent cannot publish their own service directly", async ({}) => {
    const talent = await createTestUser("servicepublishbypass", "talent");
    const service = await seedTalentService(talent.id); // defaults to a complete pending_review row
    try {
      const asTalent = await createUserClient(talent.email);
      const { error } = await asTalent.from("talent_services").update({ status: "published" }).eq("id", service.id);
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/only staff/i);
    } finally {
      await service.cleanup();
      await deleteTestUser(talent.id);
    }
  });

  test("a talent cannot submit an incomplete service for review", async ({}) => {
    const talent = await createTestUser("incompleteservice", "talent");
    const service = await seedTalentService(talent.id, {
      status: "draft",
      deliverables: null,
      payment_basis: null,
      price: null,
    });
    try {
      const asTalent = await createUserClient(talent.email);
      const { error } = await asTalent.from("talent_services").update({ status: "pending_review" }).eq("id", service.id);
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/missing required details/i);
    } finally {
      await service.cleanup();
      await deleteTestUser(talent.id);
    }
  });
});
