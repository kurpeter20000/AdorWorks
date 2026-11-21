"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/dal/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/domain/audit";
import { DOMAIN_EVENTS } from "@/lib/domain/events";
import { getCollectionAccounts, getEscrowRates, getFeeRates, getReceivingBankAccounts } from "@/lib/dal/settings";
import { collectionAccountsToJson, type MobileMoneyAccount } from "@/lib/domain/collectionAccounts";
import { normalisePhone } from "@/lib/domain/payoutMethods";
import { MAX_FEE_PERCENT } from "@/lib/domain/fees";
import { BANK_CURRENCIES, receivingBankAccountsToJson, type ReceivingBankAccounts } from "@/lib/domain/bankTransfer";
import { MAX_DISPUTE_WINDOW_DAYS, MIN_DISPUTE_WINDOW_DAYS } from "@/lib/domain/escrow";
import type { FormState } from "./auth";

const FeeSchema = z.object({
  enabled: z.boolean(),
  employerPercent: z.coerce.number().min(0, "Can't be negative.").max(MAX_FEE_PERCENT, `At most ${MAX_FEE_PERCENT}%.`),
  talentPercent: z.coerce.number().min(0, "Can't be negative.").max(MAX_FEE_PERCENT, `At most ${MAX_FEE_PERCENT}%.`),
  reason: z.string().trim().min(10, "Say why this is changing (at least 10 characters) — it goes in the audit log."),
});

/**
 * Finance/admin only. Changes apply to payments made from now on; every
 * past payment keeps the rate stamped on it at the time (0096).
 */
export async function updateFeeSettings(_prev: FormState, formData: FormData): Promise<FormState & { saved?: boolean }> {
  const session = await requireRole("finance", "admin");
  const parsed = FeeSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    employerPercent: formData.get("employerPercent"),
    talentPercent: formData.get("talentPercent"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const v = parsed.data;

  const before = await getFeeRates();
  const value = { enabled: v.enabled, employer_percent: v.employerPercent, talent_percent: v.talentPercent };
  const admin = createAdminClient();
  const { error } = await admin
    .from("platform_settings")
    .upsert({ key: "fees", value, updated_by: session.userId, updated_at: new Date().toISOString() });
  if (error) return { message: `Could not save: ${error.message}` };

  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.PLATFORM_SETTINGS_CHANGED,
    actorId: session.userId,
    entityType: "platform_settings",
    entityId: "fees",
    source: "platform",
    reason: v.reason,
    before: { enabled: before.enabled, employer_percent: before.employerPercent, talent_percent: before.talentPercent },
    after: value,
  });
  revalidatePath("/operations/settings");
  return { saved: true };
}

const EscrowSchema = z.object({
  enabled: z.boolean(),
  disputeWindowDays: z.coerce
    .number()
    .min(MIN_DISPUTE_WINDOW_DAYS, `At least ${MIN_DISPUTE_WINDOW_DAYS} day.`)
    .max(MAX_DISPUTE_WINDOW_DAYS, `At most ${MAX_DISPUTE_WINDOW_DAYS} days.`),
  reason: z.string().trim().min(10, "Say why this is changing (at least 10 characters) — it goes in the audit log."),
});

/**
 * Finance/admin only. Built in full (0099) but this switch is the one
 * thing standing between it and real money moving through it — leave it
 * off until the holding-client-funds legal question is answered and an
 * MTN disbursement agreement exists (docs/stage-16-payments-messaging-and-trust.md).
 */
export async function updateEscrowSettings(_prev: FormState, formData: FormData): Promise<FormState & { saved?: boolean }> {
  const session = await requireRole("finance", "admin");
  const parsed = EscrowSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    disputeWindowDays: formData.get("disputeWindowDays"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const v = parsed.data;

  const before = await getEscrowRates();
  const value = { enabled: v.enabled, dispute_window_days: v.disputeWindowDays };
  const admin = createAdminClient();
  const { error } = await admin
    .from("platform_settings")
    .upsert({ key: "escrow", value, updated_by: session.userId, updated_at: new Date().toISOString() });
  if (error) return { message: `Could not save: ${error.message}` };

  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.PLATFORM_SETTINGS_CHANGED,
    actorId: session.userId,
    entityType: "platform_settings",
    entityId: "escrow",
    source: "platform",
    reason: v.reason,
    before: { enabled: before.enabled, dispute_window_days: before.disputeWindowDays },
    after: value,
  });
  revalidatePath("/operations/settings");
  return { saved: true };
}

const BankAccountSchema = z.object({
  bankName: z.string().trim().min(2, "Enter the bank's name.").max(120),
  accountName: z.string().trim().min(2, "Enter the name on the account.").max(120),
  accountNumber: z.string().trim().regex(/^[0-9A-Za-z -]{4,40}$/, "Enter the account number (letters, numbers, spaces or dashes)."),
  branch: z.string().trim().max(120),
  swiftCode: z.string().trim().max(20),
});

/**
 * Finance/admin only. AdorWorks' own bank accounts, one per currency
 * (owner: SSP at Equity, USD at KCB), that employers pay into by bank
 * transfer from any bank. A currency left empty has no bank transfer
 * option. Each transfer already under way keeps the details it was
 * started with (payment_intentions.bank_account), so keep an old account
 * open until those have landed.
 */
export async function updateReceivingBankAccount(_prev: FormState, formData: FormData): Promise<FormState & { saved?: boolean }> {
  const session = await requireRole("finance", "admin");
  const errors: Record<string, string[]> = {};
  const accounts: ReceivingBankAccounts = {};
  for (const c of BANK_CURRENCIES) {
    const raw = {
      bankName: String(formData.get(`${c}_bankName`) ?? ""),
      accountName: String(formData.get(`${c}_accountName`) ?? ""),
      accountNumber: String(formData.get(`${c}_accountNumber`) ?? ""),
      branch: String(formData.get(`${c}_branch`) ?? ""),
      swiftCode: String(formData.get(`${c}_swiftCode`) ?? ""),
    };
    if (!raw.bankName.trim() && !raw.accountName.trim() && !raw.accountNumber.trim()) continue;
    const parsed = BankAccountSchema.safeParse(raw);
    if (!parsed.success) {
      for (const [k, v] of Object.entries(parsed.error.flatten().fieldErrors)) if (v?.length) errors[`${c}_${k}`] = v;
      continue;
    }
    accounts[c] = parsed.data;
  }
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 10) errors.reason = ["Say why this is changing (at least 10 characters) — it goes in the audit log."];
  if (Object.keys(errors).length > 0) return { errors };

  const before = await getReceivingBankAccounts();
  const value = receivingBankAccountsToJson(accounts);
  const admin = createAdminClient();
  const { error } = await admin
    .from("platform_settings")
    .upsert({ key: "bank_account", value, updated_by: session.userId, updated_at: new Date().toISOString() });
  if (error) return { message: `Could not save: ${error.message}` };

  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.PLATFORM_SETTINGS_CHANGED,
    actorId: session.userId,
    entityType: "platform_settings",
    entityId: "bank_account",
    source: "platform",
    reason,
    before: receivingBankAccountsToJson(before),
    after: value,
  });
  revalidatePath("/operations/settings");
  return { saved: true };
}

/**
 * Finance/admin only. AdorWorks' own MTN MoMo and mGurush accounts — where
 * employers' mobile-money payments land and where the commission stays
 * once the talent is paid. Either can be left empty. A blank number and
 * name removes that account.
 */
export async function updateCollectionAccounts(_prev: FormState, formData: FormData): Promise<FormState & { saved?: boolean }> {
  const session = await requireRole("finance", "admin");
  const errors: Record<string, string[]> = {};
  const read = (key: "mtn" | "mgurush"): MobileMoneyAccount | null => {
    const rawNumber = String(formData.get(`${key}Number`) ?? "").trim();
    const accountName = String(formData.get(`${key}Name`) ?? "").trim();
    if (!rawNumber && !accountName) return null;
    const number = normalisePhone(rawNumber);
    if (!number) errors[`${key}Number`] = ["Enter a valid phone number, e.g. 0912 345 678."];
    if (accountName.length < 2 || accountName.length > 120) errors[`${key}Name`] = ["Enter the name registered on the account."];
    return number && !errors[`${key}Name`] ? { number, accountName } : null;
  };
  const accounts = { mtn_momo: read("mtn"), mgurush: read("mgurush") };
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 10) errors.reason = ["Say why this is changing (at least 10 characters) — it goes in the audit log."];
  if (Object.keys(errors).length > 0) return { errors };

  const before = await getCollectionAccounts();
  const value = collectionAccountsToJson(accounts);
  const admin = createAdminClient();
  const { error } = await admin
    .from("platform_settings")
    .upsert({ key: "collection_accounts", value, updated_by: session.userId, updated_at: new Date().toISOString() });
  if (error) return { message: `Could not save: ${error.message}` };

  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.PLATFORM_SETTINGS_CHANGED,
    actorId: session.userId,
    entityType: "platform_settings",
    entityId: "collection_accounts",
    source: "platform",
    reason,
    before: collectionAccountsToJson(before),
    after: value,
  });
  revalidatePath("/operations/settings");
  return { saved: true };
}

const SwitchSchema = z.object({
  key: z.enum(["guarantee", "programme_sharing"]),
  enabled: z.boolean(),
  reason: z.string().trim().min(10, "Say why this is changing (at least 10 characters) — e.g. who approved the wording."),
});

/**
 * Finance/admin only (0120). Turns the Employer Guarantee or the
 * programme-sharing consent screens on for users. Both stay off until
 * counsel has approved the wording.
 */
export async function updateFeatureSwitch(_prev: FormState, formData: FormData): Promise<FormState & { saved?: boolean }> {
  const session = await requireRole("finance", "admin");
  const parsed = SwitchSchema.safeParse({ key: formData.get("key"), enabled: formData.get("enabled") === "on", reason: formData.get("reason") ?? "" });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const admin = createAdminClient();
  const { error } = await admin
    .from("platform_settings")
    .upsert({ key: parsed.data.key, value: { enabled: parsed.data.enabled }, updated_by: session.userId, updated_at: new Date().toISOString() });
  if (error) return { message: `Could not save: ${error.message}` };
  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.PLATFORM_SETTINGS_CHANGED,
    actorId: session.userId,
    entityType: "platform_settings",
    entityId: parsed.data.key,
    source: "platform",
    reason: parsed.data.reason,
    after: { enabled: parsed.data.enabled },
  });
  revalidatePath("/operations/settings");
  return { saved: true };
}

const FxSchema = z.object({
  usdToSsp: z.coerce.number().positive("Enter how many SSP one US dollar buys.").max(1_000_000),
  reason: z.string().trim().min(10, "Say where the rate comes from (at least 10 characters), e.g. the bank's rate today."),
});

/** Finance/admin (0125): today's USD→SSP rate, shown to employers before they pay. Information only; nothing is converted. */
export async function updateFxRate(_prev: FormState, formData: FormData): Promise<FormState & { saved?: boolean }> {
  const session = await requireRole("finance", "admin");
  const parsed = FxSchema.safeParse({ usdToSsp: formData.get("usdToSsp"), reason: formData.get("reason") ?? "" });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const value = { usd_to_ssp: parsed.data.usdToSsp, updated_at: new Date().toISOString() };
  const admin = createAdminClient();
  const { error } = await admin.from("platform_settings").upsert({ key: "fx", value, updated_by: session.userId, updated_at: value.updated_at });
  if (error) return { message: `Could not save: ${error.message}` };
  await logAuditEvent(admin, { name: DOMAIN_EVENTS.PLATFORM_SETTINGS_CHANGED, actorId: session.userId, entityType: "platform_settings", entityId: "fx", source: "platform", reason: parsed.data.reason, after: value });
  revalidatePath("/operations/settings");
  return { saved: true };
}
