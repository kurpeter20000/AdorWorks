import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase } from "@/lib/testing/fakeSupabase";

const state = vi.hoisted(() => ({
  fake: null as null | ReturnType<typeof import("@/lib/testing/fakeSupabase").createFakeSupabase>,
  role: "individual_client",
  rpc: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dal/session", () => ({
  requireSession: async () => ({ userId: "u-1", role: state.role }),
  requireRole: async (...roles: string[]) => {
    if (!roles.includes(state.role)) throw new Error("REDIRECT:/dashboard?error=forbidden");
    return { userId: "u-1", role: state.role };
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: state.rpc }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => state.fake!.client }));
vi.mock("@/lib/domain/audit", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/domain/notifications", () => ({ notifyUser: vi.fn(), NOTIFICATION_TYPES: new Proxy({}, { get: (_t, k) => String(k) }) }));
vi.mock("@/lib/email", () => ({ sendEmailSafely: vi.fn(), getUserEmail: vi.fn(async () => null) }));
vi.mock("@/lib/emailTemplate", () => ({ renderEmail: () => "" }));
vi.mock("@/lib/unsubscribeToken", () => ({ buildUnsubscribeUrl: () => "" }));

const { offerInterviewSlots } = await import("./interviews");
const { staffMessageApplicant } = await import("./messages");

const at = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

beforeEach(() => {
  state.role = "individual_client";
  state.rpc.mockReset();
  state.rpc.mockResolvedValue({ data: null, error: null });
  state.fake = createFakeSupabase({
    applications: [
      { id: "a-short", stage: "shortlisted", talent_id: "t-1", opportunity_id: "o-1" },
      { id: "a-new", stage: "submitted", talent_id: "t-2", opportunity_id: "o-1" },
    ],
    opportunities: [{ id: "o-1", organisation_id: "g-1" }],
    organisations: [{ id: "g-1", representative_id: "rep-1" }],
    conversations: [],
    conversation_members: [],
    messages: [],
  });
});

describe("offering interview times", () => {
  it("sends 1–5 times to the database", async () => {
    expect(await offerInterviewSlots("a-short", [{ starts_at: at(30) }, { starts_at: at(50), mode: "phone" }])).toEqual({});
    expect(state.rpc).toHaveBeenCalledWith("offer_interview_slots", expect.objectContaining({ p_application_id: "a-short" }));
  });
  it("refuses none, more than five, or a time that isn't a time", async () => {
    expect((await offerInterviewSlots("a-short", [])).error).toBeTruthy();
    expect((await offerInterviewSlots("a-short", Array.from({ length: 6 }, (_, i) => ({ starts_at: at(30 + i) })))).error).toBeTruthy();
    expect((await offerInterviewSlots("a-short", [{ starts_at: "tomorrow at 3" }])).error).toBeTruthy();
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("passes on the database's refusal", async () => {
    state.rpc.mockResolvedValue({ data: null, error: { message: "You can't schedule interviews for this application." } });
    expect((await offerInterviewSlots("a-short", [{ starts_at: at(30) }])).error).toMatch(/can't schedule/);
  });
});

describe("staff messaging an applicant", () => {
  it("is for matchers and admins only", async () => {
    state.role = "reviewer";
    await expect(staffMessageApplicant("a-short", "Hello")).rejects.toThrow(/forbidden/);
  });
  it("works once shortlisted, marked as from AdorWorks", async () => {
    state.role = "matcher";
    expect(await staffMessageApplicant("a-short", "Can you do Thursday?")).toEqual({});
    expect(state.fake!.db.messages[0].body).toBe("AdorWorks team: Can you do Thursday?");
  });
  it("not before they're shortlisted", async () => {
    state.role = "matcher";
    expect((await staffMessageApplicant("a-new", "Hello")).error).toMatch(/shortlisted/);
  });
  it("blocks contact details, like every pre-contract message", async () => {
    state.role = "matcher";
    expect((await staffMessageApplicant("a-short", "Call me on 0912 345 678")).error).toBeTruthy();
  });
});
