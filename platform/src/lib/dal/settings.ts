import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { FEES_OFF, parseFeeRates, parseFeeSettings, type FeeSettings } from "@/lib/domain/fees";
import { parseReceivingBankAccount, type ReceivingBankAccount } from "@/lib/domain/bankTransfer";
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

/** AdorWorks' own account employers pay into by bank transfer (0116). Null = not set up, so bank transfer isn't offered. */
export async function getReceivingBankAccount(): Promise<ReceivingBankAccount | null> {
  return parseReceivingBankAccount(await readSetting("bank_account"));
}

/** When payments made with escrow off started going into the payouts queue (0116). Null = migration not run yet. */
export async function getPayoutsQueueStart(): Promise<string | null> {
  const value = await readSetting("payouts_queue_start");
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}
