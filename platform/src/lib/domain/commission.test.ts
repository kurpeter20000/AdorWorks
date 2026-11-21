import { describe, it, expect } from "vitest";
import { summariseCommission } from "./commission";

describe("commission totals", () => {
  it("adds employer and talent fees per account and currency, keeping test payments apart", () => {
    const { live, test } = summariseCommission([
      { provider_name: "mtn_momo", currency: "SSP", employer_fee_amount: 2500, fee_amount: 7500, is_simulated: false },
      { provider_name: "mtn_momo", currency: "SSP", employer_fee_amount: 500, fee_amount: 1500, is_simulated: false },
      { provider_name: "bank_transfer", currency: "USD", employer_fee_amount: 25, fee_amount: 75, is_simulated: false },
      { provider_name: "mgurush", currency: "SSP", employer_fee_amount: 100, fee_amount: 300, is_simulated: true },
    ]);
    expect(live).toEqual([
      { channel: "mtn_momo", currency: "SSP", payments: 2, fromEmployers: 3000, fromTalent: 9000, total: 12000 },
      { channel: "bank_transfer", currency: "USD", payments: 1, fromEmployers: 25, fromTalent: 75, total: 100 },
    ]);
    expect(test).toHaveLength(1);
    expect(test[0].total).toBe(400);
  });
});
