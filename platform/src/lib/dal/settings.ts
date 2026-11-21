import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { FEES_OFF, parseFeeRates, parseFeeSettings, type FeeSettings } from "@/lib/domain/fees";
import { parseReceivingBankAccounts, pickBankAccount, type ReceivingBankAccount, type ReceivingBankAccounts } from "@/lib/domain/bankTransfer";
import { parseCollectionAccounts, type CollectionAccounts } from "@/lib/domain/collectionAccounts";
import { parseGuaranteeEnabled } from "@/lib/domain/guarantee";
import { ESCROW_OFF, parseEscrowRates, parseEscrowSettings, type EscrowSettings } from "@/lib/domain/escrow";

async function readSetting(key: string): Promise<unknown> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("platform_settings").select("value").eq("key", key).maybeSingle();
  if (error) {
    console.error("[settings] could not read '%s':", key, error.message);
    return null;
  }
  return data?.value ?? null;
}

/**
 * The fees to charge right now (0096). If the setting can't be read, no
 * fee is charged — the safe failure for a payment is "nothing extra",
 * never a guessed rate.
 */
export async function getFeeSettings(): Promise<FeeSettings> {
  const value = await readSetting("fees");
  return value === null ? FEES_OFF : parseFeeSettings(value);
}

/** The stored rates and switch, even while fees are off — for /operations/settings. */
export async function getFeeRates(): Promise<FeeSettings & { loaded: boolean }> {
  const value = await readSetting("fees");
  return { ...parseFeeRates(value), loaded: value !== null };
}

/** Whether escrow is holding payments right now (0099). Unreadable means off — release immediately. */
export async function getEscrowSettings(): Promise<EscrowSettings> {
  const value = await readSetting("escrow");
  return value === null ? ESCROW_OFF : parseEscrowSettings(value);
}

/** The stored escrow settings even while off — for /operations/settings. */
export async function getEscrowRates(): Promise<EscrowSettings & { loaded: boolean }> {
  const value = await readSetting("escrow");
  return { ...parseEscrowRates(value), loaded: value !== null };
}

/** AdorWorks' own bank accounts, one per currency (0116; SSP and USD). */
export async function getReceivingBankAccounts(): Promise<ReceivingBankAccounts> {
  return parseReceivingBankAccounts(await readSetting("bank_account"));
}

/** The account for payments in `currency`. Null = none set up, so bank transfer isn't offered for it. */
export async function getReceivingBankAccount(currency: string): Promise<ReceivingBankAccount | null> {
  return pickBankAccount(await getReceivingBankAccounts(), currency);
}

/** When payments made with escrow off started going into the payouts queue (0116). Null = migration not run yet. */
export async function getPayoutsQueueStart(): Promise<string | null> {
  const value = await readSetting("payouts_queue_start");
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

/** AdorWorks' own MTN MoMo and mGurush accounts, where mobile-money payments and commission land. */
export async function getCollectionAccounts(): Promise<CollectionAccounts> {
  return parseCollectionAccounts(await readSetting("collection_accounts"));
}

/** 0120: Employer Guarantee shown to employers? Off until counsel approves the wording. */
export async function isGuaranteeEnabled(): Promise<boolean> {
  return parseGuaranteeEnabled(await readSetting("guarantee"));
}

/** 0120: programme-partner consent screens shown to talent? Off until approved. */
export async function isProgrammeSharingEnabled(): Promise<boolean> {
  return parseGuaranteeEnabled(await readSetting("programme_sharing"));
}
