import { describe, it, expect } from "vitest";
import { PAYMENT_PROVIDERS, getPaymentProvider } from "./paymentProviders";

const mgurush = getPaymentProvider("mgurush")!;
const mtnMomo = getPaymentProvider("mtn_momo")!;
const card = getPaymentProvider("visa_mastercard")!;

describe("getPaymentProvider", () => {
  it("returns each registered provider by id", () => {
    expect(mgurush.id).toBe("mgurush");
    expect(mtnMomo.id).toBe("mtn_momo");
    expect(card.id).toBe("visa_mastercard");
  });

  it("returns undefined for an unknown provider id", () => {
    expect(getPaymentProvider("paypal")).toBeUndefined();
  });

  it("registers exactly the three known providers", () => {
    expect(PAYMENT_PROVIDERS.map((p) => p.id).sort()).toEqual(["mgurush", "mtn_momo", "visa_mastercard"]);
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

describe("card provider (Visa/Mastercard)", () => {
  const validExpiry = () => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = String(now.getFullYear() + 2).slice(-2);
    return `${month}/${year}`;
  };

  it("rejects when no card details are provided", async () => {
    const result = await card.charge({ phone: "", amount: 100, currency: "SSP" });
    expect(result.success).toBe(false);
  });

  it("accepts a well-formed Visa number and reports last4 + brand", async () => {
    const result = await card.charge({
      phone: "",
      amount: 100,
      currency: "SSP",
      card: { number: "4242 4242 4242 4242", expiry: validExpiry(), cvv: "123" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.cardLast4).toBe("4242");
      expect(result.cardBrand).toBe("Visa");
      expect(result.reference).toMatch(/^CARD-SIM-/);
    }
  });

  it("detects a Mastercard number", async () => {
    const result = await card.charge({
      phone: "",
      amount: 100,
      currency: "SSP",
      card: { number: "5555555555554444", expiry: validExpiry(), cvv: "123" },
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.cardBrand).toBe("Mastercard");
  });

  it("rejects a card number that's too short", async () => {
    const result = await card.charge({
      phone: "",
      amount: 100,
      currency: "SSP",
      card: { number: "4242", expiry: validExpiry(), cvv: "123" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a card number with non-digit characters", async () => {
    const result = await card.charge({
      phone: "",
      amount: 100,
      currency: "SSP",
      card: { number: "4242-4242-4242-42ab", expiry: validExpiry(), cvv: "123" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an expired card", async () => {
    const result = await card.charge({
      phone: "",
      amount: 100,
      currency: "SSP",
      card: { number: "4242424242424242", expiry: "01/20", cvv: "123" },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toMatch(/expired/i);
  });

  it("rejects a malformed expiry date", async () => {
    const result = await card.charge({
      phone: "",
      amount: 100,
      currency: "SSP",
      card: { number: "4242424242424242", expiry: "13/28", cvv: "123" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a CVV that's the wrong length", async () => {
    const result = await card.charge({
      phone: "",
      amount: 100,
      currency: "SSP",
      card: { number: "4242424242424242", expiry: validExpiry(), cvv: "12" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a CVV with letters", async () => {
    const result = await card.charge({
      phone: "",
      amount: 100,
      currency: "SSP",
      card: { number: "4242424242424242", expiry: validExpiry(), cvv: "12a" },
    });
    expect(result.success).toBe(false);
  });
});
