import { describe, it, expect } from "vitest";
import { PAYMENT_PROVIDERS, getPaymentProvider } from "./paymentProviders";

const mgurush = getPaymentProvider("mgurush")!;
const mtnMomo = getPaymentProvider("mtn_momo")!;

describe("getPaymentProvider", () => {
  it("returns each registered provider by id", () => {
    expect(mgurush.id).toBe("mgurush");
    expect(mtnMomo.id).toBe("mtn_momo");
  });

  it("returns undefined for an unknown provider id", () => {
    expect(getPaymentProvider("paypal")).toBeUndefined();
  });

  it("registers exactly the two mobile-money partners, MTN first (the default)", () => {
    expect(PAYMENT_PROVIDERS.map((p) => p.id)).toEqual(["mtn_momo", "mgurush"]);
  });

  it("no longer offers card", () => {
    expect(getPaymentProvider("visa_mastercard")).toBeUndefined();
  });
});

describe("mobile money providers (m-Gurush / MTN MoMo)", () => {
  it("accepts a plausible phone number and returns a provider-prefixed reference", async () => {
    const result = await mgurush.charge({ phone: "+211912345678", amount: 100, currency: "SSP" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.reference).toMatch(/^MGURUSH-SIM-/);
  });

  it("accepts a phone number with spaces", async () => {
    const result = await mtnMomo.charge({ phone: "+211 912 345 678", amount: 100, currency: "SSP" });
    expect(result.success).toBe(true);
  });

  it("rejects a phone number that's too short", async () => {
    const result = await mgurush.charge({ phone: "12345", amount: 100, currency: "SSP" });
    expect(result.success).toBe(false);
  });

  it("rejects a phone number with letters", async () => {
    const result = await mgurush.charge({ phone: "+211abc345678", amount: 100, currency: "SSP" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty phone number", async () => {
    const result = await mgurush.charge({ phone: "", amount: 100, currency: "SSP" });
    expect(result.success).toBe(false);
  });
});
