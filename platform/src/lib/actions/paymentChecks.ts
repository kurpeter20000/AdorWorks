"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole, FINANCE_ROLES } from "@/lib/dal/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { readStatement, reconcile, type LedgerEntry } from "@/lib/domain/reconciliation";
import { compareNames } from "@/lib/domain/nameCheck";
import { logAuditEvent } from "@/lib/domain/audit";
import { DOMAIN_EVENTS } from "@/lib/domain/events";
import type { FormState } from "./auth";

/** Payment checks (0125): statement reconciliation and the wallet name check. Finance and admins only. */

// Server Actions accept 1 MB by default (next.config serverActions.bodySizeLimit); stay under it.
const MAX_FILE_BYTES = 950 * 1024;

const RunSchema = z.object({
  account: z.enum(["mtn_momo", "mgurush", "bank_ssp", "bank_usd"]),
  periodStart: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the first day the statement covers."),
  periodEnd: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the last day the statement covers."),
  note: z.string().trim().max(1000),
});

export interface ReconcileState extends FormState {
  runId?: string;
}

/** Upload a statement CSV and match it against AdorWorks' payments in and payouts for that account and period. */
export async function runReconciliation(_prev: ReconcileState, formData: FormData): Promise<ReconcileState> {
  const session = await requireRole(...FINANCE_ROLES);
  const parsed = RunSchema.safeParse({
    account: formData.get("account"),
    periodStart: formData.get("periodStart") ?? "",
    periodEnd: formData.get("periodEnd") ?? "",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const v = parsed.data;
  if (v.periodEnd < v.periodStart) return { errors: { periodEnd: ["The end date is before the start date."] } };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { errors: { file: ["Choose the statement file (CSV)."] } };
  if (file.size > MAX_FILE_BYTES) return { errors: { file: ["The file is larger than about 1 MB. Download a shorter date range."] } };
  const read = readStatement(await file.text());
  if ("error" in read) return { errors: { file: [`${read.error} Export the statement as CSV from your MTN, mGurush or bank portal.`] } };

  const admin = createAdminClient();
  const from = `${v.periodStart}T00:00:00Z`;
  // A day of slack either side for time zones and late posting.
  const to = new Date(Date.parse(`${v.periodEnd}T00:00:00Z`) + 2 * 86400000).toISOString();
  const fromSlack = new Date(Date.parse(from) - 86400000).toISOString();
  const ledger: LedgerEntry[] = [];

  const provider = v.account === "mtn_momo" || v.account === "mgurush" ? v.account : "bank_transfer";
  const currency = v.account === "bank_usd" ? "USD" : v.account === "bank_ssp" ? "SSP" : null;
  let inQuery = admin
    .from("payment_events")
    .select("id, intention_id, external_reference, total_charged, currency, created_at, receipt_number")
    .eq("status", "succeeded")
    .eq("provider_name", provider)
    .gte("created_at", fromSlack)
    .lt("created_at", to);
  if (currency) inQuery = inQuery.eq("currency", currency);
  const { data: paymentsIn, error: inError } = await inQuery;
  if (inError) return { message: `Could not read payments: ${inError.message}` };
  const intentionIds = (paymentsIn ?? []).map((p) => p.intention_id).filter((x): x is string => !!x);
  const { data: intentions } = intentionIds.length
    ? await admin.from("payment_intentions").select("id, transfer_reference").in("id", intentionIds)
    : { data: [] as { id: string; transfer_reference: string | null }[] };
  for (const p of paymentsIn ?? []) {
    const transferRef = (intentions ?? []).find((i) => i.id === p.intention_id)?.transfer_reference;
    ledger.push({
      id: `in:${p.id}`,
      kind: "payment_in",
      references: [p.external_reference, transferRef ?? ""].filter(Boolean),
      amount: Number(p.total_charged),
      date: p.created_at,
      label: `Payment in · receipt ${p.receipt_number ?? "—"}`,
    });
  }

  const payoutMethod = v.account === "mtn_momo" || v.account === "mgurush" ? v.account : "bank";
  let outQuery = admin
    .from("payment_events")
    .select("id, disbursement_reference, net_amount, currency, disbursed_at, payout_receipt_number")
    .eq("disbursement_status", "succeeded")
    .eq("payout_method", payoutMethod)
    .gte("disbursed_at", fromSlack)
    .lt("disbursed_at", to);
  if (currency) outQuery = outQuery.eq("currency", currency);
  const { data: payouts, error: outError } = await outQuery;
  if (outError) return { message: `Could not read payouts: ${outError.message}` };
  for (const p of payouts ?? []) {
    ledger.push({
      id: `out:${p.id}`,
      kind: "payout",
      references: [p.disbursement_reference ?? ""].filter(Boolean),
      amount: Number(p.net_amount),
      date: p.disbursed_at ?? "",
      label: `Payout · receipt ${p.payout_receipt_number ?? "—"}`,
    });
  }

  const result = reconcile(read.lines, ledger);
  const { data: run, error } = await admin
    .from("reconciliation_runs")
    .insert({
      account: v.account,
      period_start: v.periodStart,
      period_end: v.periodEnd,
      file_name: file.name.slice(0, 200),
      statement_lines: read.lines.length,
      matched: result.matched.length,
      unmatched_statement: result.unmatchedStatement,
      missing_from_statement: result.missingFromStatement,
      amount_mismatches: result.amountMismatches.map((m) => ({ line: m.line, entry: m.entry })),
      uploaded_by: session.userId,
      note: v.note || null,
    })
    .select("id")
    .single();
  if (error) return { message: `Could not save the check: ${error.message}` };
  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.PAYMENT_STATUS_CHANGED,
    actorId: session.userId,
    entityType: "reconciliation_runs",
    entityId: run.id,
    source: "platform",
    after: { account: v.account, lines: read.lines.length, matched: result.matched.length, unmatched: result.unmatchedStatement.length, missing: result.missingFromStatement.length, mismatches: result.amountMismatches.length },
  });
  revalidatePath("/operations/payouts");
  return { runId: run.id };
}

const NameSchema = z.object({
  nameOnAccount: z.string().trim().min(3, "Enter the name exactly as MTN, mGurush or the bank shows it.").max(160),
  confirmDifferent: z.boolean(),
});

/**
 * Before a talent's first payout, finance records the name the wallet or
 * bank account is registered to. A clearly different name needs an
 * explicit confirmation that it was checked with the talent.
 */
export async function recordPayoutNameCheck(talentId: string, _prev: FormState, formData: FormData): Promise<FormState & { saved?: boolean; result?: string }> {
  const session = await requireRole(...FINANCE_ROLES);
  const parsed = NameSchema.safeParse({ nameOnAccount: formData.get("nameOnAccount") ?? "", confirmDifferent: formData.get("confirmDifferent") === "on" });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const admin = createAdminClient();
  const [{ data: profile }, { data: tp }] = await Promise.all([
    admin.from("profiles").select("full_name").eq("id", talentId).maybeSingle(),
    admin.from("talent_profiles").select("display_name").eq("id", talentId).maybeSingle(),
  ]);
  const names = [profile?.full_name, tp?.display_name].filter((n): n is string => !!n);
  const results = names.map((n) => compareNames(parsed.data.nameOnAccount, n));
  const best = results.includes("match") ? "match" : results.includes("close") ? "close" : "different";
  if (best === "different" && !parsed.data.confirmDifferent) {
    return {
      result: best,
      message: `That name doesn't match the talent's name (${names.join(" / ") || "no name on file"}). Check with the talent, then tick the box to confirm.`,
    };
  }
  const { data: updated, error } = await admin
    .from("talent_payout_methods")
    .update({ name_on_account: parsed.data.nameOnAccount, name_checked_at: new Date().toISOString(), name_checked_by: session.userId })
    .eq("talent_id", talentId)
    .select("talent_id");
  if (error) return { message: error.message };
  if (!updated?.length) return { message: "This talent hasn't added a payout method yet." };
  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.PAYMENT_STATUS_CHANGED,
    actorId: session.userId,
    subjectId: talentId,
    entityType: "talent_payout_methods",
    entityId: talentId,
    source: "platform",
    after: { nameCheck: best, nameOnAccount: parsed.data.nameOnAccount },
  });
  revalidatePath("/operations/payouts");
  return { saved: true, result: best };
}
