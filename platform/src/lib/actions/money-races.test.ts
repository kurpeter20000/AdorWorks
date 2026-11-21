/**
 * Race-condition and permission tests for the actions that move money or
 * create contracts. Each "race" test fires the same action twice at once
 * (double-tap / two tabs / two staff) and asserts only one takes effect.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase } from "@/lib/testing/fakeSupabase";

const state = vi.hoisted(() => ({
  fake: null as null | ReturnType<typeof import("@/lib/testing/fakeSupabase").createFakeSupabase>,
  role: "finance" as string,
  userId: "staff-1",
  payout: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dal/contractTerms", () => ({ ensureContractTerms: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/dal/session", async () => {
  const FINANCE_ROLES = ["finance", "admin"];
  return {
    STAFF_ROLES: ["reviewer", "matcher", "finance", "admin"],
    FINANCE_ROLES,
    CLIENT_ROLES: ["individual_client", "employer"],
    canMoveMoney: (r: string) => FINANCE_ROLES.includes(r),
    requireRole: async (...roles: string[]) => {
      if (!roles.includes(state.role)) throw new Error("REDIRECT:/dashboard?error=forbidden");
      return { userId: state.userId, role: state.role };
    },
  };
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => state.fake!.client }));
vi.mock("@/lib/payoutProviders.server", () => ({
  getActivePayoutProvider: async () => ({ payout: state.payout }),
}));
vi.mock("@/lib/domain/notifications", () => ({ notifyUser: vi.fn(), NOTIFICATION_TYPES: new Proxy({}, { get: (_t, k) => String(k) }) }));
vi.mock("@/lib/email", () => ({ sendEmailSafely: vi.fn(), getUserEmail: vi.fn(async () => null) }));
vi.mock("@/lib/emailTemplate", () => ({ renderEmail: () => "" }));
vi.mock("@/lib/unsubscribeToken", () => ({ buildUnsubscribeUrl: () => "" }));
vi.mock("@/lib/domain/audit", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/dal/settings", () => ({
  getFeeSettings: async () => ({ talentFeePercent: 0, employerFeePercent: 0 }),
  getEscrowSettings: async () => ({ enabled: true, disputeWindowDays: 7 }),
}));

const { releaseEscrowedPayment } = await import("./escrow");
const { confirmInstitutionalPayment } = await import("./institutionalPayments");
const { acceptOffer, acceptServiceProposal } = await import("./offers");

function as(role: string, userId = "staff-1") {
  state.role = role;
  state.userId = userId;
}

beforeEach(() => {
  state.payout.mockReset();
  state.payout.mockResolvedValue({ success: true, reference: "PAYOUT-1" });
});

// ---------------------------------------------------------------------------
describe("releaseEscrowedPayment", () => {
  function seed(extra: { disputes?: Record<string, unknown>[] } = {}) {
    state.fake = createFakeSupabase({
      payment_events: [
        { id: "pe-1", contract_id: "c-1", net_amount: 500, currency: "SSP", escrow_status: "held", dispute_window_ends_at: "2000-01-01T00:00:00Z", disbursement_status: null },
      ],
      contracts: [{ id: "c-1", talent_id: "t-1" }],
      profiles: [{ id: "t-1", phone: "+211912345678" }],
      disputes: extra.disputes ?? [],
    });
  }

  it("pays out exactly once when released twice at the same moment", async () => {
    seed();
    as("finance");
    const [a, b] = await Promise.all([releaseEscrowedPayment("pe-1"), releaseEscrowedPayment("pe-1")]);
    expect(state.payout).toHaveBeenCalledTimes(1);
    expect([a.released, b.released].filter(Boolean)).toHaveLength(1);
    expect(state.fake!.db.payment_events[0].escrow_status).toBe("released");
  });

  it("refuses reviewers and matchers", async () => {
    seed();
    for (const role of ["reviewer", "matcher"]) {
      as(role);
      await expect(releaseEscrowedPayment("pe-1")).rejects.toThrow(/forbidden/);
    }
    expect(state.payout).not.toHaveBeenCalled();
  });

  it("blocks release when a contract has more than one unresolved dispute", async () => {
    seed({
      disputes: [
        { id: "d-1", contract_id: "c-1", status: "open" },
        { id: "d-2", contract_id: "c-1", status: "escalated" },
      ],
    });
    as("admin");
    const result = await releaseEscrowedPayment("pe-1");
    expect(result.message).toMatch(/open dispute/);
    expect(state.payout).not.toHaveBeenCalled();
  });

  it("does not retry a payout stuck mid-disbursement", async () => {
    seed();
    state.fake!.db.payment_events[0].disbursement_status = "pending";
    as("finance");
    const result = await releaseEscrowedPayment("pe-1");
    expect(result.message).toMatch(/already being processed/);
    expect(state.payout).not.toHaveBeenCalled();
  });

  it("allows retrying after a failed payout", async () => {
    seed();
    state.fake!.db.payment_events[0].disbursement_status = "failed";
    as("finance");
    const result = await releaseEscrowedPayment("pe-1");
    expect(result.released).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe("confirmInstitutionalPayment", () => {
  function seed() {
    state.fake = createFakeSupabase({
      finance_records: [{ id: "inv-1", contract_id: "c-1", milestone_id: "m-1", amount: 1000, currency: "USD", status: "pending", record_type: "invoice" }],
      contracts: [{ id: "c-1", talent_id: "t-1", organisation_id: "o-1" }],
      organisations: [{ id: "o-1", org_type: "ngo" }],
      payment_events: [],
      milestones: [{ id: "m-1", status: "pending" }],
    });
  }
  const form = () => {
    const fd = new FormData();
    fd.set("bankReference", "BANK-123");
    return fd;
  };

  it("records one payment when two staff confirm the same invoice at once", async () => {
    seed();
    as("finance");
    const [a, b] = await Promise.all([confirmInstitutionalPayment("inv-1", {}, form()), confirmInstitutionalPayment("inv-1", {}, form())]);
    expect(state.fake!.db.payment_events).toHaveLength(1);
    expect([a.confirmed, b.confirmed].filter(Boolean)).toHaveLength(1);
  });

  it("puts the invoice back to pending if recording the payment fails", async () => {
    seed();
    state.fake!.fail("payment_events.insert", "boom");
    as("finance");
    const result = await confirmInstitutionalPayment("inv-1", {}, form());
    expect(result.message).toMatch(/Could not record the payment/);
    expect(state.fake!.db.finance_records[0].status).toBe("pending");
  });

  it("refuses reviewers", async () => {
    seed();
    as("reviewer");
    await expect(confirmInstitutionalPayment("inv-1", {}, form())).rejects.toThrow(/forbidden/);
    expect(state.fake!.db.payment_events).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe("acceptOffer", () => {
  function seed() {
    state.fake = createFakeSupabase({
      offers: [
        { id: "of-1", talent_id: "t-1", organisation_id: "o-1", opportunity_id: "op-1", application_id: "ap-1", service_request_id: null, status: "sent", currency: "USD", compensation_amount: 300, milestone_plan: null, created_by: "u-org" },
      ],
      applications: [{ id: "ap-1", stage: "offered" }],
      contracts: [],
      milestones: [],
    });
  }

  it("creates one contract when accepted twice at the same moment", async () => {
    seed();
    as("talent", "t-1");
    const results = await Promise.all([acceptOffer("of-1"), acceptOffer("of-1")]);
    expect(state.fake!.db.contracts).toHaveLength(1);
    expect(state.fake!.db.milestones).toHaveLength(1);
    expect(results.filter((r) => !r.error)).toHaveLength(1);
  });

  it("rolls everything back if the milestones can't be created", async () => {
    seed();
    state.fake!.fail("milestones.insert", "boom");
    as("talent", "t-1");
    const result = await acceptOffer("of-1");
    expect(result.error).toMatch(/Nothing was accepted/);
    expect(state.fake!.db.contracts).toHaveLength(0);
    expect(state.fake!.db.offers[0].status).toBe("sent");
    expect(state.fake!.db.applications[0].stage).toBe("offered");
  });
});

describe("acceptServiceProposal", () => {
  it("creates one contract when two org members accept at once", async () => {
    state.fake = createFakeSupabase({
      offers: [{ id: "of-2", talent_id: "t-1", organisation_id: "o-1", service_request_id: "sr-1", application_id: null, status: "sent", currency: "USD", compensation_amount: 300, created_by: "t-1" }],
      organisations: [{ id: "o-1", representative_id: "u-rep" }],
      organisation_members: [{ organisation_id: "o-1", user_id: "u-rep", role: "admin" }],
      service_requests: [{ id: "sr-1", status: "proposed" }],
      contracts: [],
      milestones: [],
    });
    as("individual_client", "u-rep");
    await Promise.all([acceptServiceProposal("of-2"), acceptServiceProposal("of-2")]);
    expect(state.fake!.db.contracts).toHaveLength(1);
    expect(state.fake!.db.milestones).toHaveLength(1);
  });
});
