import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { FEES_OFF, parseFeeRates, parseFeeSettings, type FeeSettings } from "@/lib/domain/fees";
import { ESCROW_OFF, parseEscrowRates, parseEscrowSettings, type EscrowSettings } from "@/lib/domain/escrow";

async function readSetting(key: string): Promise<unknown> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("platform_settings").select("value").eq("key", key).maybeSingle();
  if (error) {
    console.error(`[settings] could not read '${key}':`, error.message);
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
