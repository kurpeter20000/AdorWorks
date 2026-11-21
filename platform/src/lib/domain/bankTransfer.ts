/**
 * Bank transfer (owner decision, 2026-11-21): open to any bank. The
 * employer sends the money from whichever bank they use into AdorWorks'
 * own account — held at Equity Bank, but that's only where AdorWorks
 * banks, not a restriction on the employer. The account details are a
 * staff setting (platform_settings key 'bank_account', edited at
 * /operations/settings) so they can change without a release.
 */
export interface ReceivingBankAccount {
  bankName: string;
  accountName: string;
  accountNumber: string;
  /** Optional extras employers sending from abroad or another bank may need. */
  branch: string;
  swiftCode: string;
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** The saved account, or null when it hasn't been set up (bank transfer is then not offered). */
export function parseReceivingBankAccount(value: unknown): ReceivingBankAccount | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const account = {
    bankName: text(v.bank_name, 120),
    accountName: text(v.account_name, 120),
    accountNumber: text(v.account_number, 40),
    branch: text(v.branch, 120),
    swiftCode: text(v.swift_code, 20),
  };
  if (!account.bankName || !account.accountName || !account.accountNumber) return null;
  return account;
}

/** The stored (snake_case) shape, as in platform_settings and payment_intentions.bank_account. */
export function receivingBankAccountToJson(a: ReceivingBankAccount) {
  return { bank_name: a.bankName, account_name: a.accountName, account_number: a.accountNumber, branch: a.branch, swift_code: a.swiftCode };
}

/** No 0/O or 1/I/L, so it survives being read out over the phone or typed into a banking app. */
const REFERENCE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** e.g. "AWP-7KQ4ZD": what the employer writes in the transfer's reference field. */
export function newTransferReference(randomIndex: (max: number) => number): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += REFERENCE_ALPHABET[randomIndex(REFERENCE_ALPHABET.length)];
  return `AWP-${code}`;
}
