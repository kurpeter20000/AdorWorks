/**
 * Bulk shortlist / decline (spec: "bulk select works on up to 50
 * applicants"): only still-new applications on this opportunity change,
 * each one through the same path as a single decision.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase } from "@/lib/testing/fakeSupabase";

const state = vi.hoisted(() => ({
  fake: null as null | ReturnType<typeof import("@/lib/testing/fakeSupabase").createFakeSupabase>,
  role: "individual_client",
  email: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`REDIRECT:${u}`); } }));
vi.mock("@/lib/dal/session", () => ({
  CLIENT_ROLES: ["individual_client", "employer", "org_admin", "org_member"],
  requireRole: async (...roles: string[]) => {
    if (!roles.includes(state.role)) throw new Error("REDIRECT:/dashboard?error=forbidden");
    return { userId: "rep-1", role: state.role };
  },
  requireSession: async () => ({ userId: "rep-1", role: state.role }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.fake!.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => state.fake!.client }));
vi.mock("@/lib/domain/notifications", () => ({ notifyUser: vi.fn(), NOTIFICATION_TYPES: new Proxy({}, { get: (_t, k) => String(k) }) }));
vi.mock("@/lib/email", () => ({ sendEmailSafely: state.email, getUserEmail: vi.fn(async () => "t@example.test") }));
vi.mock("@/lib/emailTemplate", () => ({ renderEmail: () => "", escapeHtml: (s: string) => s }));
vi.mock("@/lib/unsubscribeToken", () => ({ buildUnsubscribeUrl: () => "" }));
vi.mock("@/lib/domain/audit", () => ({ logAuditEvent: vi.fn() }));

const { bulkSetApplicationStage } = await import("./applications");

const OPP = "00000000-0000-4000-8000-00000000000a";
const OTHER = "00000000-0000-4000-8000-00000000000b";
// Real ids are random v4 UUIDs; the validator checks the version nibble.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

beforeEach(() => {
  state.role = "individual_client";
  state.email.mockReset();
  state.fake = createFakeSupabase({
    applications: [
      { id: id(1), stage: "submitted", opportunity_id: OPP, talent_id: "t1" },
      { id: id(2), stage: "submitted", opportunity_id: OPP, talent_id: "t2" },
      { id: id(3), stage: "shortlisted", opportunity_id: OPP, talent_id: "t3" },
      { id: id(4), stage: "submitted", opportunity_id: OTHER, talent_id: "t4" },
    ],
    opportunities: [{ id: OPP, title: "Designer" }],
  });
});

const stageOf = (n: number) => state.fake!.db.applications.find((r) => r.id === id(n))?.stage;

describe("bulk shortlist / decline", () => {
  it("shortlists the selected new applicants and skips the rest", async () => {
    const r = await bulkSetApplicationStage({ ids: [id(1), id(2), id(3), id(4)], opportunityId: OPP, stage: "shortlisted" });
    expect(r).toEqual({ done: 2, skipped: 2, failed: 0 });
    expect([stageOf(1), stageOf(2), stageOf(3), stageOf(4)]).toEqual(["shortlisted", "shortlisted", "shortlisted", "submitted"]);
  });

  it("declines with the kind note, one email per candidate", async () => {
    const r = await bulkSetApplicationStage({ ids: [id(1), id(2)], opportunityId: OPP, stage: "rejected", reason: "Thank you for applying." });
    expect(r.done).toBe(2);
    expect(state.fake!.db.applications.find((a) => a.id === id(1))?.decision_reason).toBe("Thank you for applying.");
    expect(state.email).toHaveBeenCalledTimes(2);
  });

  it("refuses more than 50 at once", async () => {
    const ids = Array.from({ length: 51 }, (_, i) => id(100 + i));
    expect((await bulkSetApplicationStage({ ids, opportunityId: OPP, stage: "shortlisted" })).error).toMatch(/50/);
  });

  it("is for employers only", async () => {
    state.role = "talent";
    await expect(bulkSetApplicationStage({ ids: [id(1)], opportunityId: OPP, stage: "shortlisted" })).rejects.toThrow(/forbidden/);
  });
});
