import { describe, it, expect } from "vitest";
import { PAYOUT_PROVIDERS, getPayoutProvider } from "./payoutProviders";

const mtnMomo = getPayoutProvider("mtn_momo")!;

describe("getPayoutProvider", () => {
  it("returns the registered provider by id", () => {
    expect(mtnMomo.id).toBe("mtn_momo");
  });

  it("returns undefined for an unknown provider id", () => {
    expect(getPayoutProvider("paypal")).toBeUndefined();
  });

  it("registers exactly the one known provider", () => {
    expect(PAYOUT_PROVIDERS.map((p) => p.id)).toEqual(["mtn_momo"]);
  });
});

describe("MTN MoMo payout (simulated)", () => {
  it("accepts a plausible phone number and returns a prefixed reference", async () => {
    const result = await mtnMomo.payout({ phone: "+211912345678", amount: 100, currency: "SSP" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.reference).toMatch(/^PAYOUT-SIM-/);
  });

  it("rejects a phone number that's too short", async () => {
    const result = await mtnMomo.payout({ phone: "12345", amount: 100, currency: "SSP" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty phone number", async () => {
    const result = await mtnMomo.payout({ phone: "", amount: 100, currency: "SSP" });
    expect(result.success).toBe(false);
  });
});
