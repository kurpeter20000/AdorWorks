import { msg } from "@/i18n/config";

/** Owner decision (2026-11-16): talent are paid by bank, MTN MoMo or mGurush (0114). */
export const PAYOUT_METHODS = {
  mtn_momo: msg("MTN Mobile Money (MoMo)"),
  mgurush: msg("mGurush"),
  bank: msg("Bank transfer"),
} as const;
export type PayoutMethod = keyof typeof PAYOUT_METHODS;

export interface PayoutMethodRow {
  method: PayoutMethod;
  phone: string | null;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
}

/** One line finance staff can pay from, e.g. "mGurush · +211912345678". */
export function describePayoutMethod(p: PayoutMethodRow | null | undefined): string {
  if (!p) return "Not set yet — ask the talent to add it under Finance";
  if (p.method === "bank") return `Bank transfer · ${p.bank_name} · ${p.account_name} · ${p.account_number}`;
  return `${p.method === "mgurush" ? "mGurush" : "MTN MoMo"} · ${p.phone}`;
}

/** +211 912 345 678 / 0912345678 → +211912345678 (South Sudan default). */
export function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/[\s()-]/g, "");
  if (/^\+[0-9]{9,15}$/.test(digits)) return digits;
  if (/^0[0-9]{9}$/.test(digits)) return `+211${digits.slice(1)}`;
  if (/^[0-9]{9}$/.test(digits)) return `+211${digits}`;
  return null;
}
