import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase } from "@/lib/testing/fakeSupabase";

const state = vi.hoisted(() => ({
  fake: null as null | ReturnType<typeof import("@/lib/testing/fakeSupabase").createFakeSupabase>,
  userId: "u-admin",
  notify: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dal/session", () => ({
  CLIENT_ROLES: ["individual_client", "employer"],
  requireRole: async () => ({ userId: state.userId, role: "individual_client" }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.fake!.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => state.fake!.client }));
vi.mock("@/lib/domain/audit", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/domain/notifications", () => ({ notifyUser: state.notify, NOTIFICATION_TYPES: new Proxy({}, { get: (_t, k) => String(k) }) }));
vi.mock("@/lib/email", () => ({ sendEmailSafely: vi.fn(), getUserEmail: vi.fn(async () => null) }));
vi.mock("@/lib/emailTemplate", () => ({ renderEmail: () => "" }));
vi.mock("@/lib/unsubscribeToken", () => ({ buildUnsubscribeUrl: () => "" }));

const { changeTeamMemberRole, removeTeamMember, revokeTeamInvitation } = await import("./organisationTeam");

function seed(members: { user_id: string; role: string }[]) {
  state.fake = createFakeSupabase({
    organisations: [{ id: "o-1", representative_id: "u-rep" }],
    organisation_members: members.map((m) => ({ organisation_id: "o-1", ...m })),
    organisation_team_invitations: [{ id: "inv-1", organisation_id: "o-1", status: "accepted" }],
  });
}

beforeEach(() => {
  state.userId = "u-admin";
  state.notify.mockReset();
});

describe("team role guards", () => {
  it("the only admin cannot demote themselves", async () => {
    seed([{ user_id: "u-admin", role: "admin" }]);
    const result = await changeTeamMemberRole("o-1", "u-admin", "viewer");
    expect(result.error).toMatch(/at least one admin/);
    expect(state.fake!.db.organisation_members[0].role).toBe("admin");
    expect(state.notify).not.toHaveBeenCalled();
  });

  it("an admin can be demoted when another admin remains", async () => {
    seed([
      { user_id: "u-admin", role: "admin" },
      { user_id: "u-2", role: "admin" },
    ]);
    const result = await changeTeamMemberRole("o-1", "u-2", "member");
    expect(result.error).toBeUndefined();
    expect(state.fake!.db.organisation_members[1].role).toBe("member");
    expect(state.notify).toHaveBeenCalledTimes(1);
  });

  it("does not send the 'role changed' notice when the update fails", async () => {
    seed([
      { user_id: "u-admin", role: "admin" },
      { user_id: "u-2", role: "member" },
    ]);
    state.fake!.fail("organisation_members.update", "permission denied");
    const result = await changeTeamMemberRole("o-1", "u-2", "viewer");
    expect(result.error).toMatch(/permission denied/);
    expect(state.notify).not.toHaveBeenCalled();
  });

  it("returns a readable error to non-admins instead of throwing", async () => {
    seed([
      { user_id: "u-admin", role: "admin" },
      { user_id: "u-2", role: "member" },
    ]);
    state.userId = "u-2";
    expect((await changeTeamMemberRole("o-1", "u-admin", "viewer")).error).toMatch(/Only a team admin/);
  });

  it("the only admin cannot be removed", async () => {
    seed([
      { user_id: "u-admin", role: "admin" },
      { user_id: "u-other-admin", role: "admin" },
    ]);
    // remove one admin: allowed
    expect((await removeTeamMember("o-1", "u-other-admin")).error).toBeUndefined();
    // now u-admin is the last admin — but they're removing themselves
    expect((await removeTeamMember("o-1", "u-admin")).error).toMatch(/at least one admin/);
  });

  it("revoking an invite that was already used reports it instead of hiding the row", async () => {
    seed([{ user_id: "u-admin", role: "admin" }]);
    expect((await revokeTeamInvitation("o-1", "inv-1")).error).toMatch(/already accepted, revoked or has expired/);
  });
});
