import { describe, it, expect, vi } from "vitest";
import { createFakeSupabase } from "@/lib/testing/fakeSupabase";

const state = vi.hoisted(() => ({
  fake: null as null | ReturnType<typeof import("@/lib/testing/fakeSupabase").createFakeSupabase>,
  role: "employer",
  userId: "u-rep",
  guarantee: true,
  sharing: true,
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
vi.mock("@/lib/dal/settings", () => ({ isGuaranteeEnabled: async () => state.guarantee, isProgrammeSharingEnabled: async () => state.sharing }));
vi.mock("@/lib/domain/notifications", () => ({ notifyUser: vi.fn(), NOTIFICATION_TYPES: new Proxy({}, { get: (_t, k) => String(k) }) }));
vi.mock("@/lib/domain/audit", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/i18n/server", () => ({ getLocale: async () => "ar" }));

const { requestReplacement, resolveGuaranteeRequest } = await import("./guarantee");
const { saveProgrammeConsent } = await import("./programmeConsent");

const as = (role: string, userId: string) => Object.assign(state, { role, userId });
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

function seedContract(startedDaysAgo: number, engagement = "freelance") {
  state.fake = createFakeSupabase({
    contracts: [{ id: "c-1", organisation_id: "o-1", opportunity_id: "op-1", started_at: daysAgo(startedDaysAgo), status: "active" }],
    opportunities: [{ id: "op-1", engagement_type: engagement, account_contact_id: "staff-1" }],
    organisation_members: [
      { organisation_id: "o-1", user_id: "u-rep", role: "admin" },
      { organisation_id: "o-1", user_id: "u-view", role: "viewer" },
    ],
    guarantee_requests: [],
  });
}
const ask = () => form({ reason: "left_early", details: "The designer stopped replying after week one." });

describe("Employer Guarantee", () => {
  it("refuses everything while switched off", async () => {
    seedContract(5);
    state.guarantee = false;
    as("employer", "u-rep");
    expect((await requestReplacement("c-1", {}, ask())).message).toMatch(/isn't available yet/);
    state.guarantee = true;
  });

  it("accepts a request inside the window", async () => {
    seedContract(5);
    as("employer", "u-rep");
    expect((await requestReplacement("c-1", {}, ask())).sent).toBe(true);
    expect(state.fake!.db.guarantee_requests[0]).toMatchObject({ status: "open", reason: "left_early" });
  });

  it("uses 30 days for contracts and 90 for full-time hires", async () => {
    seedContract(40);
    as("employer", "u-rep");
    expect((await requestReplacement("c-1", {}, ask())).message).toMatch(/window .* has ended/);
    seedContract(40, "full_time");
    expect((await requestReplacement("c-1", {}, ask())).sent).toBe(true);
  });

  it("doesn't let viewers ask", async () => {
    seedContract(5);
    as("employer", "u-view");
    expect((await requestReplacement("c-1", {}, ask())).message).toMatch(/permission/);
  });

  it("needs a reason the employer can read when staff decline", async () => {
    seedContract(5);
    as("employer", "u-rep");
    await requestReplacement("c-1", {}, ask());
    const id = state.fake!.db.guarantee_requests[0].id as string;
    as("matcher", "staff-1");
    expect((await resolveGuaranteeRequest(id, {}, form({ status: "declined", note: "" }))).errors?.note).toBeTruthy();
    expect((await resolveGuaranteeRequest(id, {}, form({ status: "replacement_sent", note: "Three new candidates sent." }))).done).toBe(true);
    expect((await resolveGuaranteeRequest(id, {}, form({ status: "closed", note: "" }))).message).toMatch(/already handled/);
  });
});

describe("programme consent", () => {
  function seed() {
    state.fake = createFakeSupabase({
      programme_members: [{ programme_id: "pr-1", talent_id: "t-1", is_minor: false }],
      programme_consents: [],
    });
  }

  it("records each choice with language and wording version, never sharing earnings without named progress", async () => {
    seed();
    as("talent", "t-1");
    expect((await saveProgrammeConsent("pr-1", {}, form({ share_earnings: "on" }))).saved).toBe(true);
    expect(state.fake!.db.programme_consents[0]).toMatchObject({ share_named_progress: false, share_earnings: false, language: "ar" });
    await saveProgrammeConsent("pr-1", {}, form({ share_named_progress: "on", share_earnings: "on" }));
    expect(state.fake!.db.programme_consents).toHaveLength(2);
  });

  it("only lets members choose, and only while switched on", async () => {
    seed();
    as("talent", "t-2");
    expect((await saveProgrammeConsent("pr-1", {}, form({}))).message).toMatch(/not part of this programme/);
    state.sharing = false;
    as("talent", "t-1");
    expect((await saveProgrammeConsent("pr-1", {}, form({}))).message).toMatch(/isn't available yet/);
    state.sharing = true;
  });
});
