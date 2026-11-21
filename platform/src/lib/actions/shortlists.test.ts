import { describe, it, expect, vi } from "vitest";
import { createFakeSupabase } from "@/lib/testing/fakeSupabase";

const state = vi.hoisted(() => ({
  fake: null as null | ReturnType<typeof import("@/lib/testing/fakeSupabase").createFakeSupabase>,
  role: "matcher",
  userId: "staff-1",
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dal/session", () => ({
  CLIENT_ROLES: ["individual_client", "employer"],
  requireRole: async (...roles: string[]) => {
    if (!roles.includes(state.role)) throw new Error("REDIRECT:/dashboard?error=forbidden");
    return { userId: state.userId, role: state.role };
  },
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => state.fake!.client }));
vi.mock("@/lib/domain/notifications", () => ({ notifyUser: vi.fn(), NOTIFICATION_TYPES: new Proxy({}, { get: (_t, k) => String(k) }) }));
vi.mock("@/lib/email", () => ({ sendEmailSafely: vi.fn(), getUserEmail: vi.fn(async () => null) }));
vi.mock("@/lib/emailTemplate", () => ({ renderEmail: () => "", escapeHtml: (s: string) => s }));
vi.mock("@/lib/unsubscribeToken", () => ({ buildUnsubscribeUrl: () => "" }));
vi.mock("@/lib/domain/audit", () => ({ logAuditEvent: vi.fn() }));

const { sendShortlist, respondToShortlist, requestMoreCandidates, saveReviewerNote } = await import("./shortlists");

function as(role: string, userId: string) {
  state.role = role;
  state.userId = userId;
}

function seed(notes: (string | null)[] = ["Strong NGO design portfolio.", "Delivered two brand launches."]) {
  state.fake = createFakeSupabase({
    opportunities: [{ id: "op-1", title: "Graphic designer", organisation_id: "o-1" }],
    organisations: [{ id: "o-1", representative_id: "u-rep" }],
    organisation_members: [
      { organisation_id: "o-1", user_id: "u-rep", role: "admin" },
      { organisation_id: "o-1", user_id: "u-view", role: "viewer" },
    ],
    applications: notes.map((n, i) => ({ id: `ap-${i}`, opportunity_id: "op-1", talent_id: `t-${i}`, source: "matched", stage: "submitted", reviewer_note: n })),
  });
}

describe("shortlist builder", () => {
  it("won't send until every candidate has a reviewer note", async () => {
    seed(["Good fit.", null]);
    as("matcher", "staff-1");
    const r = await sendShortlist("op-1");
    expect(r.error).toMatch(/1 missing/);
    expect(state.fake!.db.applications.every((a) => a.stage === "submitted")).toBe(true);
  });

  it("sends once even if clicked twice", async () => {
    seed();
    as("matcher", "staff-1");
    const [a, b] = await Promise.all([sendShortlist("op-1"), sendShortlist("op-1")]);
    expect([a.sent, b.sent].filter(Boolean)).toEqual([2]);
    expect(state.fake!.db.applications.every((x) => x.stage === "shortlisted")).toBe(true);
    expect(state.fake!.db.opportunities[0].shortlist_sent_at).toBeTruthy();
  });

  it("keeps a shortlist to at most 5 under review", async () => {
    seed(Array.from({ length: 6 }, () => "A clear reason for this candidate."));
    as("matcher", "staff-1");
    expect((await sendShortlist("op-1")).error).toMatch(/at most 5/);
  });

  it("is staff-only, and notes must say something", async () => {
    seed();
    as("employer", "u-rep");
    await expect(sendShortlist("op-1")).rejects.toThrow(/forbidden/);
    as("matcher", "staff-1");
    expect((await saveReviewerNote("ap-0", "ok")).error).toMatch(/at least a sentence/);
  });
});

describe("employer shortlist review", () => {
  async function sent() {
    seed();
    as("matcher", "staff-1");
    await sendShortlist("op-1");
  }

  it("moves a candidate to interview, once", async () => {
    await sent();
    as("employer", "u-rep");
    const [a, b] = await Promise.all([respondToShortlist("ap-0", "interview"), respondToShortlist("ap-0", "interview")]);
    expect([a.error, b.error].filter(Boolean)).toHaveLength(1);
    expect(state.fake!.db.applications[0].stage).toBe("interviewing");
  });

  it("declines kindly with the ready-written note when none is given", async () => {
    await sent();
    as("employer", "u-rep");
    await respondToShortlist("ap-1", "decline");
    expect(state.fake!.db.applications[1].stage).toBe("rejected");
    expect(String(state.fake!.db.applications[1].decision_reason)).toMatch(/Thank you for applying/);
  });

  it("doesn't let viewers or other organisations decide", async () => {
    await sent();
    as("employer", "u-view");
    expect((await respondToShortlist("ap-0", "interview")).error).toMatch(/permission/);
    as("employer", "u-stranger");
    expect((await requestMoreCandidates("op-1", "")).error).toMatch(/permission/);
    expect(state.fake!.db.applications[0].stage).toBe("shortlisted");
  });

  it("records a request for more candidates, and the next shortlist clears it", async () => {
    await sent();
    as("employer", "u-rep");
    expect(await requestMoreCandidates("op-1", "Need someone with Arabic.")).toEqual({});
    expect(state.fake!.db.opportunities[0].more_candidates_note).toBe("Need someone with Arabic.");
    state.fake!.db.applications.push({ id: "ap-9", opportunity_id: "op-1", talent_id: "t-9", source: "matched", stage: "submitted", reviewer_note: "Fluent Arabic, strong portfolio." });
    as("matcher", "staff-1");
    await sendShortlist("op-1");
    expect(state.fake!.db.opportunities[0].more_candidates_requested_at).toBeNull();
  });
});
