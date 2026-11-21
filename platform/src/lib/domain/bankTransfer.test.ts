import { describe, it, expect } from "vitest";
import { newTransferReference, parseReceivingBankAccount, receivingBankAccountToJson } from "./bankTransfer";

describe("receiving bank account", () => {
  it("needs a bank, account name and number before bank transfer is offered", () => {
    expect(parseReceivingBankAccount(null)).toBeNull();
    expect(parseReceivingBankAccount({ bank_name: "Equity Bank", account_name: "AdorWorks" })).toBeNull();
    const a = parseReceivingBankAccount({ bank_name: " Equity Bank ", account_name: "AdorWorks", account_number: "100200300" });
    expect(a).toEqual({ bankName: "Equity Bank", accountName: "AdorWorks", accountNumber: "100200300", branch: "", swiftCode: "" });
  });

  it("round-trips through the stored shape", () => {
    const a = { bankName: "Equity Bank", accountName: "AdorWorks", accountNumber: "1", branch: "Juba", swiftCode: "EQBLSSJU" };
    expect(parseReceivingBankAccount(receivingBankAccountToJson(a))).toEqual(a);
  });
});

describe("transfer reference", () => {
  it("is AWP- plus six characters with no look-alikes", () => {
    for (let i = 0; i < 50; i++) {
      expect(newTransferReference((max) => Math.floor(Math.random() * max))).toMatch(/^AWP-[A-HJKMNP-Z2-9]{6}$/);
    }
  });
});
