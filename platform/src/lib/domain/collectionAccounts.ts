import { normalisePhone } from "./payoutMethods";

/**
 * AdorWorks' own mobile-money accounts (owner request, 2026-11-21): where
 * employers' MTN MoMo and mGurush payments land. AdorWorks collects the
 * whole payment, pays the talent their net share, and keeps the
 * commission (employer fee + talent fee) in these accounts. Stored in
 * platform_settings key 'collection_accounts', edited by finance at
 * /operations/settings. Pure, so it can be tested.
 */
export interface MobileMoneyAccount {
  number: string;
  accountName: string;
}
export interface CollectionAccounts {
  mtn_momo: MobileMoneyAccount | null;
  mgurush: MobileMoneyAccount | null;
}

export const NO_COLLECTION_ACCOUNTS: CollectionAccounts = { mtn_momo: null, mgurush: null };

function parseAccount(v: unknown): MobileMoneyAccount | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const number = typeof r.number === "string" ? normalisePhone(r.number) : null;
  const accountName = typeof r.account_name === "string" ? r.account_name.trim().slice(0, 120) : "";
  return number && accountName ? { number, accountName } : null;
}

export function parseCollectionAccounts(value: unknown): CollectionAccounts {
  if (!value || typeof value !== "object") return NO_COLLECTION_ACCOUNTS;
  const v = value as Record<string, unknown>;
  return { mtn_momo: parseAccount(v.mtn_momo), mgurush: parseAccount(v.mgurush) };
}

export function collectionAccountsToJson(a: CollectionAccounts) {
  const one = (x: MobileMoneyAccount | null) => (x ? { number: x.number, account_name: x.accountName } : null);
  return { mtn_momo: one(a.mtn_momo), mgurush: one(a.mgurush) };
}

/** "MTN MoMo · AdorWorks Ltd · +211912345678", as stamped on payment_events.received_into. */
export function describeCollectionAccount(provider: "mtn_momo" | "mgurush", a: MobileMoneyAccount | null): string | null {
  if (!a) return null;
  return `${provider === "mtn_momo" ? "MTN MoMo" : "mGurush"} · ${a.accountName} · ${a.number}`;
}
