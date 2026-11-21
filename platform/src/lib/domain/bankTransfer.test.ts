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

describe("bank accounts by currency", () => {
  const equity = { bankName: "Equity Bank", accountName: "AdorWorks", accountNumber: "111", branch: "", swiftCode: "" };
  const kcb = { bankName: "KCB", accountName: "AdorWorks", accountNumber: "222", branch: "", swiftCode: "" };

  it("shows each employer the account for their payment's currency", async () => {
    const { parseReceivingBankAccounts, pickBankAccount, receivingBankAccountsToJson } = await import("./bankTransfer");
    const accounts = parseReceivingBankAccounts(receivingBankAccountsToJson({ SSP: equity, USD: kcb }));
    expect(pickBankAccount(accounts, "SSP")?.bankName).toBe("Equity Bank");
    expect(pickBankAccount(accounts, "USD")?.bankName).toBe("KCB");
    expect(pickBankAccount(parseReceivingBankAccounts(receivingBankAccountsToJson({ SSP: equity })), "USD")).toBeNull();
  });

  it("still reads an account saved before the split, for any currency", async () => {
    const { parseReceivingBankAccounts, pickBankAccount, receivingBankAccountToJson } = await import("./bankTransfer");
    const accounts = parseReceivingBankAccounts(receivingBankAccountToJson(kcb));
    expect(pickBankAccount(accounts, "SSP")?.bankName).toBe("KCB");
  });
});
