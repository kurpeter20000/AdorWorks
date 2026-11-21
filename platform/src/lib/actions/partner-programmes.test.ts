import { describe, it, expect, vi } from "vitest";
import { createFakeSupabase } from "@/lib/testing/fakeSupabase";

const state = vi.hoisted(() => ({
  fake: null as null | ReturnType<typeof import("@/lib/testing/fakeSupabase").createFakeSupabase>,
  role: "employer",
  userId: "u-edu-admin",
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dal/session", () => ({
  STAFF_ROLES: ["reviewer", "matcher", "finance", "admin"],
  requireRole: async (...roles: string[]) => {
    if (!roles.includes(state.role)) throw new Error("REDIRECT:/dashboard?error=forbidden");
    return { userId: state.userId, role: state.role };
  },
  requireSession: async () => ({ userId: state.userId, role: state.role }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => state.fake!.client }));
vi.mock("@/lib/domain/audit", () => ({ logAuditEvent: vi.fn() }));

const { partnerCreateCohort, partnerInviteTeamMember, partnerRemoveTeamMember, setProgrammePartner } = await import("./partnerProgrammes");

const as = (role: string, userId: string) => Object.assign(state, { role, userId });
const form = (f: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(f)) fd.set(k, v);
  return fd;
};

function seed(partner = true) {
  state.fake = createFakeSupabase({
    organisations: [{ id: "0b1c2d3e-4f50-4a61-8b72-9c83d4e5f601", name: "EduPower Youth Foundation", is_programme_partner: partner }],
    organisation_members: [
      { organisation_id: "0b1c2d3e-4f50-4a61-8b72-9c83d4e5f601", user_id: "u-edu-admin", role: "admin" },
      { organisation_id: "0b1c2d3e-4f50-4a61-8b72-9c83d4e5f601", user_id: "u-edu-member", role: "member" },
    ],
    programmes: [],
    programme_partner_users: [],
    programme_facilitators: [],
    profiles: [{ id: "u-fac", phone: "+211912000009" }],
  });
}
const cohort = () => form({ organisationId: "0b1c2d3e-4f50-4a61-8b72-9c83d4e5f601", name: "Career Readiness — Juba", programmeType: "career_readiness", funder: "", region: "Juba", startsOn: "", endsOn: "", targetPlaced: "20" });

describe("partner self-service", () => {
  it("lets an admin of an approved partner create a cohort and become its admin", async () => {
    seed();
    as("employer", "u-edu-admin");
    const r = await partnerCreateCohort({}, cohort());
    expect(r.createdId).toBeTruthy();
    const p = state.fake!.db.programmes[0];
    expect(p).toMatchObject({ partner_name: "EduPower Youth Foundation", partner_organisation_id: "0b1c2d3e-4f50-4a61-8b72-9c83d4e5f601", target_placed: 20 });
    expect(String(p.join_code)).toMatch(/^EDUP-/);
    expect(state.fake!.db.programme_partner_users[0]).toMatchObject({ user_id: "u-edu-admin", role: "admin" });
  });

  it("refuses organisations not approved as partners, and non-admin members", async () => {
    seed(false);
    as("employer", "u-edu-admin");
    expect((await partnerCreateCohort({}, cohort())).message).toMatch(/approved programme partner/);
    seed();
    as("employer", "u-edu-member");
    expect((await partnerCreateCohort({}, cohort())).message).toMatch(/approved programme partner/);
  });

  it("lets the cohort admin invite a facilitator, who still needs a background check", async () => {
    seed();
    as("employer", "u-edu-admin");
    const { createdId } = await partnerCreateCohort({}, cohort());
    const r = await partnerInviteTeamMember(createdId!, {}, form({ account: "0912000009", role: "facilitator" }));
    expect(r.saved).toBe("facilitator");
    expect(state.fake!.db.programme_facilitators[0]).toMatchObject({ user_id: "u-fac" });
    expect(state.fake!.db.programme_facilitators[0].background_check_recorded_at ?? null).toBeNull();
  });

  it("doesn't let viewers manage the team, and admins can't remove themselves", async () => {
    seed();
    as("employer", "u-edu-admin");
    const { createdId } = await partnerCreateCohort({}, cohort());
    expect((await partnerRemoveTeamMember(createdId!, "u-edu-admin", "partner")).error).toMatch(/yourself/);
    state.fake!.db.programme_partner_users.push({ programme_id: createdId!, user_id: "u-viewer", role: "viewer" });
    as("employer", "u-viewer");
    expect((await partnerInviteTeamMember(createdId!, {}, form({ account: "0912000009", role: "viewer" }))).message).toMatch(/admins/);
  });

  it("only staff approve partners", async () => {
    seed(false);
    as("employer", "u-edu-admin");
    await expect(setProgrammePartner("0b1c2d3e-4f50-4a61-8b72-9c83d4e5f601", true)).rejects.toThrow(/forbidden/);
    as("admin", "staff-1");
    expect(await setProgrammePartner("0b1c2d3e-4f50-4a61-8b72-9c83d4e5f601", true)).toEqual({});
    expect(state.fake!.db.organisations[0].is_programme_partner).toBe(true);
  });
});
