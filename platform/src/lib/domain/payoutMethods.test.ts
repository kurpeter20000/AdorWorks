import { describe, it, expect } from "vitest";
import { describePayoutMethod, normalisePhone } from "./payoutMethods";

describe("payout methods", () => {
  it("normalises South Sudan numbers and keeps international ones", () => {
    expect(normalisePhone("0912 345 678")).toBe("+211912345678");
    expect(normalisePhone("912345678")).toBe("+211912345678");
    expect(normalisePhone("+254 712 345 678")).toBe("+254712345678");
    expect(normalisePhone("call me")).toBeNull();
  });
  it("describes each method in one line for finance", () => {
    expect(describePayoutMethod({ method: "mgurush", phone: "+211912345678", bank_name: null, account_name: null, account_number: null })).toBe("mGurush · +211912345678");
    expect(describePayoutMethod({ method: "bank", phone: null, bank_name: "KCB", account_name: "Amani Lado", account_number: "1234567" })).toBe(
      "Bank transfer · KCB · Amani Lado · 1234567"
    );
    expect(describePayoutMethod(null)).toMatch(/Not set/);
  });
});
