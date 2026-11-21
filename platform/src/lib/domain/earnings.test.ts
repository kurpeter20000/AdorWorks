import { describe, it, expect } from "vitest";
import { summariseEarnings } from "./earnings";

describe("earnings card", () => {
  it("splits this month, waiting and sent per currency", () => {
    const now = new Date("2026-11-21T10:00:00Z");
    const lines = summariseEarnings(
      [
        { net_amount: 1000, currency: "SSP", created_at: "2026-11-02T10:00:00Z", escrow_status: "not_applicable", disbursement_status: "succeeded", disbursed_at: "2026-11-03T00:00:00Z" },
        { net_amount: 500, currency: "SSP", created_at: "2026-11-20T10:00:00Z", escrow_status: "held", disbursement_status: null, disbursed_at: null },
        { net_amount: 300, currency: "SSP", created_at: "2026-10-15T10:00:00Z", escrow_status: "released", disbursement_status: null, disbursed_at: null },
        { net_amount: 50, currency: "USD", created_at: "2026-11-10T10:00:00Z", escrow_status: "not_applicable", disbursement_status: "failed", disbursed_at: null },
      ],
      now
    );
    expect(lines).toEqual([
      { currency: "SSP", thisMonth: 1500, waiting: 500, sent: 1300, total: 1800 },
      { currency: "USD", thisMonth: 50, waiting: 50, sent: 0, total: 50 },
    ]);
  });
});
