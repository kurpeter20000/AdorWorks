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
  charge: vi.fn(),
  bankAccount: null as null | Record<string, string>,
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
vi.mock("@/lib/paymentProviders.server", () => ({
  getActivePaymentProvider: async () => ({ charge: state.charge }),
}));
vi.mock("@/lib/dal/settings", () => ({
  getReceivingBankAccount: async () => state.bankAccount,
  getCollectionAccounts: async () => ({ mtn_momo: { number: "+211920000000", accountName: "AdorWorks Ltd" }, mgurush: null }),
  getFeeSettings: async () => ({ enabled: false, talentPercent: 0, employerPercent: 0 }),
  getEscrowSettings: async () => ({ enabled: true, disputeWindowDays: 7 }),
}));
vi.mock("server-only", () => ({}));

const { releaseEscrowedPayment, sendPayout, recordManualPayout, resetStuckPayout } = await import("./escrow");
const { confirmBankTransfer, cancelBankTransfer } = await import("./bankTransfers");
const { payMilestone } = await import("./contracts");
const { confirmInstitutionalPayment } = await import("./institutionalPayments");
const { acceptOffer, acceptServiceProposal } = await import("./offers");

function as(role: string, userId = "staff-1") {
  state.role = role;
  state.userId = userId;
}

beforeEach(() => {
  state.charge.mockReset();
  state.charge.mockResolvedValue({ success: true, reference: "MOMO-SIM-1" });
  state.bankAccount = null;
  state.payout.mockReset();
  state.payout.mockResolvedValue({ success: true, reference: "PAYOUT-1" });
});

// ---------------------------------------------------------------------------
describe("releaseEscrowedPayment", () => {
  function seed(extra: { disputes?: Record<string, unknown>[]; method?: Record<string, unknown> | null } = {}) {
    state.fake = createFakeSupabase({
      payment_events: [
        { id: "pe-1", contract_id: "c-1", net_amount: 500, currency: "SSP", status: "succeeded", escrow_status: "held", dispute_window_ends_at: "2000-01-01T00:00:00Z", disbursement_status: null, payout_attempts: 0 },
      ],
      contracts: [{ id: "c-1", talent_id: "t-1" }],
      talent_payout_methods:
        extra.method === null ? [] : [{ talent_id: "t-1", method: "mtn_momo", phone: "+211912345678", bank_name: null, account_name: null, account_number: null, ...extra.method }],
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

  it("pays the MTN number the talent chose, and records how and where", async () => {
    seed({ method: { phone: "+211922222222" } });
    as("finance");
    await sendPayout("pe-1");
    expect(state.payout).toHaveBeenCalledWith(expect.objectContaining({ phone: "+211922222222", amount: 500 }));
    const row = state.fake!.db.payment_events[0];
    expect(row.payout_method).toBe("mtn_momo");
    expect(row.payout_destination).toContain("+211922222222");
    expect(row.payout_attempts).toBe(1);
    expect(row.payout_receipt_number).toBe("AW-TEST-000001");
  });

  it("counts failed attempts and leaves the payout retryable", async () => {
    seed();
    state.payout.mockResolvedValue({ success: false, reason: "Number not registered" });
    as("finance");
    const result = await sendPayout("pe-1");
    expect(result.message).toMatch(/Number not registered/);
    const row = state.fake!.db.payment_events[0];
    expect(row.disbursement_status).toBe("failed");
    expect(row.payout_attempts).toBe(1);
    expect(row.escrow_status).toBe("held");
  });

  it("refuses to pay when the talent hasn't chosen a payout method", async () => {
    seed({ method: null });
    as("finance");
    const result = await sendPayout("pe-1");
    expect(result.message).toMatch(/hasn't chosen how to be paid/);
    expect(state.payout).not.toHaveBeenCalled();
  });

  it("never sends mGurush or bank payouts through MTN", async () => {
    for (const method of [
      { method: "mgurush", phone: "+211933333333" },
      { method: "bank", phone: null, bank_name: "KCB", account_name: "Talent One", account_number: "123456" },
    ]) {
      seed({ method });
      as("finance");
      const result = await sendPayout("pe-1");
      expect(result.message).toMatch(/record the payout/);
    }
    expect(state.payout).not.toHaveBeenCalled();
  });

  it("pays out a payment made while escrow was off once there's no dispute", async () => {
    seed();
    Object.assign(state.fake!.db.payment_events[0], { escrow_status: "not_applicable", dispute_window_ends_at: null });
    as("finance");
    const result = await sendPayout("pe-1");
    expect(result.released).toBe(true);
    expect(state.fake!.db.payment_events[0].escrow_status).toBe("not_applicable");
    expect(state.fake!.db.payment_events[0].disbursement_status).toBe("succeeded");
  });
});

// ---------------------------------------------------------------------------
describe("recordManualPayout / resetStuckPayout", () => {
  const ref = (reference: string) => {
    const fd = new FormData();
    fd.set("reference", reference);
    return fd;
  };
  function seed(method: Record<string, unknown>, disbursement_status: string | null = null) {
    state.fake = createFakeSupabase({
      payment_events: [
        { id: "pe-1", contract_id: "c-1", net_amount: 500, currency: "SSP", status: "succeeded", escrow_status: "held", dispute_window_ends_at: "2000-01-01T00:00:00Z", disbursement_status, payout_attempts: 0 },
      ],
      contracts: [{ id: "c-1", talent_id: "t-1" }],
      talent_payout_methods: [{ talent_id: "t-1", phone: null, bank_name: null, account_name: null, account_number: null, ...method }],
      disputes: [],
    });
  }

  it("records an mGurush payout once, with who recorded it, even if submitted twice", async () => {
    seed({ method: "mgurush", phone: "+211933333333" });
    as("finance", "staff-9");
    const [a, b] = await Promise.all([recordManualPayout("pe-1", {}, ref("MG-778899")), recordManualPayout("pe-1", {}, ref("MG-778899"))]);
    expect([a.released, b.released].filter(Boolean)).toHaveLength(1);
    const row = state.fake!.db.payment_events[0];
    expect(row.escrow_status).toBe("released");
    expect(row.disbursement_reference).toBe("MG-778899");
    expect(row.payout_recorded_by).toBe("staff-9");
    expect(row.payout_method).toBe("mgurush");
    expect(state.payout).not.toHaveBeenCalled();
  });

  it("records a bank payout to the talent's own bank", async () => {
    seed({ method: "bank", bank_name: "KCB", account_name: "Talent One", account_number: "123456" });
    as("admin");
    const result = await recordManualPayout("pe-1", {}, ref("KCB-TRF-1"));
    expect(result.released).toBe(true);
    expect(state.fake!.db.payment_events[0].payout_destination).toContain("KCB");
  });

  it("requires a reference", async () => {
    seed({ method: "mgurush", phone: "+211933333333" });
    as("finance");
    const result = await recordManualPayout("pe-1", {}, ref(""));
    expect(result.errors?.reference).toBeTruthy();
  });

  it("refuses reviewers", async () => {
    seed({ method: "mgurush", phone: "+211933333333" });
    as("reviewer");
    await expect(recordManualPayout("pe-1", {}, ref("MG-1"))).rejects.toThrow(/forbidden/);
  });

  it("lets staff reset a stuck payout so it can be sent again", async () => {
    seed({ method: "mtn_momo", phone: "+211912345678" }, "pending");
    as("finance");
    const fd = new FormData();
    fd.set("note", "Not on the MTN statement for 21 Nov");
    const result = await resetStuckPayout("pe-1", {}, fd);
    expect(result.reset).toBe(true);
    expect(state.fake!.db.payment_events[0].disbursement_status).toBe("failed");
    expect((await sendPayout("pe-1")).released).toBe(true);
  });

  it("lets staff record a stuck payout they found on the statement", async () => {
    seed({ method: "mtn_momo", phone: "+211912345678" }, "pending");
    as("finance");
    const result = await recordManualPayout("pe-1", {}, ref("MOMO-123456"));
    expect(result.released).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe("bank transfers (any bank)", () => {
  function seed() {
    state.fake = createFakeSupabase({
      payment_intentions: [
        {
          id: "pi-1",
          contract_id: "c-1",
          milestone_id: "m-1",
          invoice_id: null,
          provider: "bank_transfer",
          status: "awaiting_transfer",
          transfer_reference: "AWP-7KQ4ZD",
          fee_settings: { enabled: true, employerPercent: 2.5, talentPercent: 7.5 },
          bank_account: { bank_name: "Equity Bank", account_name: "AdorWorks Ltd", account_number: "100200300" },
          amount: 1025,
          currency: "USD",
          created_by: "u-rep",
        },
      ],
      contracts: [{ id: "c-1", talent_id: "t-1", organisation_id: "o-1" }],
      organisations: [{ id: "o-1", representative_id: "u-rep" }],
      milestones: [{ id: "m-1", status: "approved", amount: 1000, currency: "USD" }],
      payment_events: [],
      finance_records: [],
    });
  }
  const confirmForm = (bankReference = "EQ-STATEMENT-55") => {
    const fd = new FormData();
    fd.set("bankReference", bankReference);
    return fd;
  };

  it("records one payment when two staff confirm the same transfer at once", async () => {
    seed();
    as("finance");
    const [a, b] = await Promise.all([confirmBankTransfer("pi-1", {}, confirmForm()), confirmBankTransfer("pi-1", {}, confirmForm())]);
    expect([a.confirmed, b.confirmed].filter(Boolean)).toHaveLength(1);
    expect(state.fake!.db.payment_events).toHaveLength(1);
    const pe = state.fake!.db.payment_events[0];
    expect(pe.provider_name).toBe("bank_transfer");
    expect(pe.external_reference).toBe("EQ-STATEMENT-55");
    expect(pe.is_simulated).toBe(false);
    expect(pe.received_into).toBe("Bank transfer · Equity Bank · AdorWorks Ltd · 100200300");
    expect(state.fake!.db.payment_intentions[0].status).toBe("succeeded");
    expect(state.fake!.db.milestones[0].status).toBe("paid");
  });

  it("charges the fee rates quoted when the transfer started", async () => {
    seed();
    as("finance");
    await confirmBankTransfer("pi-1", {}, confirmForm());
    const pe = state.fake!.db.payment_events[0];
    expect(pe.employer_fee_amount).toBe(25);
    expect(pe.total_charged).toBe(1025);
    expect(pe.net_amount).toBe(925);
  });

  it("puts the transfer back to awaiting if recording fails", async () => {
    seed();
    state.fake!.fail("payment_events.insert", "boom");
    as("finance");
    const result = await confirmBankTransfer("pi-1", {}, confirmForm());
    expect(result.message).toMatch(/Could not record the payment/);
    expect(state.fake!.db.payment_intentions[0].status).toBe("awaiting_transfer");
  });

  it("still records the payment if the receipt sequence is unavailable", async () => {
    seed();
    state.fake!.fail("rpc.next_receipt_number", "function does not exist");
    as("finance");
    const result = await confirmBankTransfer("pi-1", {}, confirmForm());
    expect(result.confirmed).toBe(true);
    expect(String(state.fake!.db.payment_events[0].receipt_number)).toMatch(/^RCPT-/);
  });

  it("refuses reviewers and employers", async () => {
    seed();
    for (const role of ["reviewer", "employer"]) {
      as(role);
      await expect(confirmBankTransfer("pi-1", {}, confirmForm())).rejects.toThrow(/forbidden/);
    }
    expect(state.fake!.db.payment_events).toHaveLength(0);
  });

  it("lets the employer cancel before the money arrives, but not after it's confirmed", async () => {
    seed();
    as("employer", "u-rep");
    expect(await cancelBankTransfer("pi-1")).toEqual({});
    expect(state.fake!.db.payment_intentions[0].status).toBe("failed");

    seed();
    as("finance");
    await confirmBankTransfer("pi-1", {}, confirmForm());
    as("employer", "u-rep");
    expect((await cancelBankTransfer("pi-1")).error).toMatch(/can't be cancelled/);
  });

  it("doesn't let someone else's account cancel the transfer", async () => {
    seed();
    as("employer", "u-other");
    expect((await cancelBankTransfer("pi-1")).error).toMatch(/permission/);
    expect(state.fake!.db.payment_intentions[0].status).toBe("awaiting_transfer");
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

// ---------------------------------------------------------------------------
describe("payMilestone (MTN, mGurush, bank transfer)", () => {
  function seed() {
    state.fake = createFakeSupabase({
      milestones: [{ id: "m-1", status: "approved", contract_id: "c-1", amount: 1000, currency: "SSP" }],
      contracts: [{ id: "c-1", talent_id: "t-1", organisation_id: "o-1" }],
      organisations: [{ id: "o-1", representative_id: "u-rep" }],
      payment_intentions: [],
      payment_events: [],
      finance_records: [],
    });
  }
  const checkout = (provider: string, phone?: string) => {
    const fd = new FormData();
    fd.set("provider", provider);
    if (phone) fd.set("phone", phone);
    return fd;
  };

  it("charges MTN Mobile Money and records a sequential receipt", async () => {
    seed();
    as("employer", "u-rep");
    const result = await payMilestone("m-1", {}, checkout("mtn_momo", "0912 345 678"));
    expect(result).toEqual({});
    expect(state.charge).toHaveBeenCalledWith(expect.objectContaining({ phone: "+211912345678" }));
    expect(state.fake!.db.payment_events[0].receipt_number).toBe("AW-TEST-000001");
    expect(state.fake!.db.payment_events[0].received_into).toBe("MTN MoMo · AdorWorks Ltd · +211920000000");
    expect(state.fake!.db.milestones[0].status).toBe("paid");
  });

  it("no longer accepts card", async () => {
    seed();
    as("employer", "u-rep");
    const result = await payMilestone("m-1", {}, checkout("visa_mastercard"));
    expect(result.errors?.provider).toBeTruthy();
    expect(state.charge).not.toHaveBeenCalled();
  });

  it("hides bank transfer until AdorWorks' account is set up", async () => {
    seed();
    as("employer", "u-rep");
    const result = await payMilestone("m-1", {}, checkout("bank_transfer"));
    expect(result.message).toMatch(/isn't available yet/);
    expect(state.fake!.db.payment_intentions).toHaveLength(0);
  });

  it("starts a bank transfer with a reference and the account shown, then blocks paying twice", async () => {
    seed();
    state.bankAccount = { bankName: "Equity Bank", accountName: "AdorWorks Ltd", accountNumber: "100200300", branch: "", swiftCode: "" };
    as("employer", "u-rep");
    expect(await payMilestone("m-1", {}, checkout("bank_transfer"))).toEqual({});
    const pi = state.fake!.db.payment_intentions[0];
    expect(pi.status).toBe("awaiting_transfer");
    expect(String(pi.transfer_reference)).toMatch(/^AWP-[A-Z2-9]{6}$/);
    expect(pi.bank_account).toMatchObject({ bank_name: "Equity Bank", account_number: "100200300" });
    expect(state.fake!.db.milestones[0].status).toBe("approved");
    expect(state.charge).not.toHaveBeenCalled();

    const again = await payMilestone("m-1", {}, checkout("mtn_momo", "0912345678"));
    expect(again.message).toMatch(/Cancel that transfer first/);
    expect(state.charge).not.toHaveBeenCalled();
  });
});
