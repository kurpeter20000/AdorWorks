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

/**
 * One AdorWorks account per currency (owner, 2026-11-21: SSP at Equity
 * Bank, USD at KCB). Stored as { by_currency: { SSP: {...}, USD: {...} } }.
 * The older single-account shape still reads, as an account for any
 * currency, until staff save the new form.
 */
export const BANK_CURRENCIES = ["SSP", "USD"] as const;
export type BankCurrency = (typeof BANK_CURRENCIES)[number];
export type ReceivingBankAccounts = Partial<Record<BankCurrency | "*", ReceivingBankAccount>>;

export function parseReceivingBankAccounts(value: unknown): ReceivingBankAccounts {
  if (!value || typeof value !== "object") return {};
  const v = value as Record<string, unknown>;
  if (v.by_currency && typeof v.by_currency === "object") {
    const out: ReceivingBankAccounts = {};
    for (const c of BANK_CURRENCIES) {
      const a = parseReceivingBankAccount((v.by_currency as Record<string, unknown>)[c]);
      if (a) out[c] = a;
    }
    return out;
  }
  const legacy = parseReceivingBankAccount(value);
  return legacy ? { "*": legacy } : {};
}

export function receivingBankAccountsToJson(accounts: ReceivingBankAccounts) {
  const by_currency: Record<string, ReturnType<typeof receivingBankAccountToJson>> = {};
  for (const c of BANK_CURRENCIES) {
    const a = accounts[c];
    if (a) by_currency[c] = receivingBankAccountToJson(a);
  }
  return { by_currency };
}

/** The account an employer paying in `currency` should send to, or null (bank transfer then isn't offered). */
export function pickBankAccount(accounts: ReceivingBankAccounts, currency: string): ReceivingBankAccount | null {
  return accounts[currency as BankCurrency] ?? accounts["*"] ?? null;
}

/** No 0/O or 1/I/L, so it survives being read out over the phone or typed into a banking app. */
const REFERENCE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** e.g. "AWP-7KQ4ZD": what the employer writes in the transfer's reference field. */
export function newTransferReference(randomIndex: (max: number) => number): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += REFERENCE_ALPHABET[randomIndex(REFERENCE_ALPHABET.length)];
  return `AWP-${code}`;
}

/** "Bank transfer · Equity Bank · AdorWorks Ltd · 100200300", as stamped on payment_events.received_into. */
export function describeReceivingBankAccount(a: ReceivingBankAccount | null): string | null {
  return a ? `Bank transfer · ${a.bankName} · ${a.accountName} · ${a.accountNumber}` : null;
}
