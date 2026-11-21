import { describe, it, expect, vi } from "vitest";
import { createFakeSupabase } from "@/lib/testing/fakeSupabase";

const state = vi.hoisted(() => ({
  fake: null as null | ReturnType<typeof import("@/lib/testing/fakeSupabase").createFakeSupabase>,
  role: "talent",
  userId: "t-1",
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dal/session", () => ({
  STAFF_ROLES: ["reviewer", "matcher", "finance", "admin"],
  CLIENT_ROLES: ["individual_client", "employer"],
  requireRole: async (...roles: string[]) => {
    if (!roles.includes(state.role)) throw new Error("REDIRECT:/dashboard?error=forbidden");
    return { userId: state.userId, role: state.role };
  },
  requireSession: async () => ({ userId: state.userId, role: state.role }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => state.fake!.client }));
vi.mock("@/lib/domain/notifications", () => ({ notifyUser: vi.fn(), NOTIFICATION_TYPES: new Proxy({}, { get: (_t, k) => String(k) }) }));
vi.mock("@/lib/domain/audit", () => ({ logAuditEvent: vi.fn() }));

const { checkInToSession, rateSession, createSession, markAttendanceByPhone, issueCertificateByPhone, submitInternshipReview } = await import("./pathwaysSessions");

const as = (role: string, userId: string) => Object.assign(state, { role, userId });
const form = (f: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(f)) fd.set(k, v);
  return fd;
};

function seed() {
  state.fake = createFakeSupabase({
    programmes: [{ id: "pr-1", name: "Career Readiness", partner_name: "EduPower Youth Foundation" }],
    programme_members: [{ programme_id: "pr-1", talent_id: "t-2" }],
    programme_sessions: [{ id: "s-1", programme_id: "pr-1", title: "CV workshop", checkin_code: "IN-7KQ4", checkin_open: true }],
    programme_attendance: [],
    programme_facilitators: [
      { programme_id: "pr-1", user_id: "f-ok", background_check_recorded_at: "2026-11-01T00:00:00Z" },
      { programme_id: "pr-1", user_id: "f-new", background_check_recorded_at: null },
    ],
    programme_certificates: [],
    profiles: [{ id: "t-2", phone: "+211912000002" }],
  });
}

describe("session check-in", () => {
  it("checks a participant in with the code, enrols them, and takes their rating", async () => {
    seed();
    as("talent", "t-1");
    const r = await checkInToSession({}, form({ code: "in-7kq4" }));
    expect(r.sessionId).toBe("s-1");
    expect(state.fake!.db.programme_members.some((m) => m.talent_id === "t-1")).toBe(true);
    expect(state.fake!.db.programme_attendance[0]).toMatchObject({ talent_id: "t-1", method: "code" });
    expect(await rateSession("s-1", 4)).toEqual({});
    expect(state.fake!.db.programme_attendance[0].feedback_score).toBe(4);
  });

  it("refuses a closed session and unknown codes", async () => {
    seed();
    state.fake!.db.programme_sessions[0].checkin_open = false;
    as("talent", "t-1");
    expect((await checkInToSession({}, form({ code: "IN-7KQ4" }))).message).toMatch(/closed/);
    expect((await checkInToSession({}, form({ code: "IN-ZZZZ" }))).errors?.code).toBeTruthy();
  });
});

describe("facilitators", () => {
  it("can't run sessions until their background check is recorded", async () => {
    seed();
    as("employer", "f-new");
    expect((await createSession("pr-1", {}, form({ title: "Interview practice", startsAt: "2026-12-01T10:00", location: "" }))).message).toMatch(/background check/);
    as("employer", "f-ok");
    expect((await createSession("pr-1", {}, form({ title: "Interview practice", startsAt: "2026-12-01T10:00", location: "" }))).saved).toBe(true);
    expect(state.fake!.db.programme_sessions).toHaveLength(2);
  });

  it("marks a participant present by phone, only if they're in the programme", async () => {
    seed();
    as("employer", "f-ok");
    expect((await markAttendanceByPhone("s-1", {}, form({ phone: "0912000002" }))).saved).toBe(true);
    expect((await markAttendanceByPhone("s-1", {}, form({ phone: "0912999999" }))).errors?.phone).toBeTruthy();
  });

  it("issues one certificate per participant with a check code", async () => {
    seed();
    as("admin", "staff-1");
    const a = await issueCertificateByPhone("pr-1", {}, form({ phone: "+211912000002" }));
    expect(a.code).toMatch(/^CERT-[A-Z2-9]{8}$/);
    const b = await issueCertificateByPhone("pr-1", {}, form({ phone: "+211912000002" }));
    expect(b.code).toBe(a.code);
    expect(state.fake!.db.programme_certificates).toHaveLength(1);
  });
});

describe("Internship Bridge reviews", () => {
  it("lets the supervisor review an internship, not other contracts", async () => {
    state.fake = createFakeSupabase({
      contracts: [
        { id: "c-int", organisation_id: "o-1", talent_id: "t-2", opportunity_id: "op-int" },
        { id: "c-job", organisation_id: "o-1", talent_id: "t-2", opportunity_id: "op-job" },
      ],
      opportunities: [
        { id: "op-int", engagement_type: "internship" },
        { id: "op-job", engagement_type: "freelance" },
      ],
      organisation_members: [{ organisation_id: "o-1", user_id: "u-rep", role: "admin" }],
      internship_reviews: [],
    });
    as("employer", "u-rep");
    const review = form({ stage: "mid_point", score_skills: "4", score_reliability: "5", score_growth: "4", strengths: "Quick learner", to_improve: "" });
    expect((await submitInternshipReview("c-int", {}, review)).saved).toBe(true);
    expect((await submitInternshipReview("c-job", {}, review)).message).toMatch(/only for internships/);
  });
});
