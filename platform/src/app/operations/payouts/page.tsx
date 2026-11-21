import type { Metadata } from "next";
import { requireRole, canMoveMoney } from "@/lib/dal/session";
import { staffAreaRoles } from "@/lib/domain/staffAccess";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { StatementCheck, type RunView } from "./statement-check";
import { getEscrowRates, getPayoutsQueueStart } from "@/lib/dal/settings";
import { PayoutsConsole, type PayoutRow } from "./payouts-console";
import { summariseCommission, type CommissionLine } from "@/lib/domain/commission";
import { getCollectionAccounts } from "@/lib/dal/settings";
import { formatMoney } from "@/lib/domain/format";
import { describePayoutMethod, type PayoutMethodRow } from "@/lib/domain/payoutMethods";

export const metadata: Metadata = { title: "Payouts — Operations" };

/**
 * Staff console for paying talent (Stage 16 step 4, reworked in 0116).
 * Every payment comes in to AdorWorks and goes out to the talent by the
 * method they chose: MTN Mobile Money is sent from here automatically;
 * mGurush and bank payouts are sent by finance and recorded here with
 * their reference. There's no scheduled job, so this is the actual payout
 * mechanism today, not just a status screen.
 */
export default async function OperationsPayoutsPage() {
  const session = await requireRole(...staffAreaRoles("payouts"));
  const supabase = await createClient();
  const escrow = await getEscrowRates();
  const queueStart = await getPayoutsQueueStart();
  const collection = await getCollectionAccounts();

  // AdorWorks' commission: both fees on every payment received.
  const { data: received } = await supabase
    .from("payment_events")
    .select("provider_name, currency, employer_fee_amount, fee_amount, is_simulated")
    .eq("status", "succeeded");
  const commission = summariseCommission(received ?? []);

  // Held payments whose dispute window has passed with no open dispute (0099).
  const { data: eligible } = await supabase.rpc("escrow_release_eligible");
  const eligibleIds = new Set((eligible ?? []).map((e) => e.payment_event_id));

  const select =
    "id, contract_id, net_amount, currency, escrow_status, dispute_window_ends_at, disbursement_status, disbursement_failure_reason, payout_attempts, payout_last_attempt_at, is_simulated, created_at";
  const { data: held } = await supabase
    .from("payment_events")
    .select(select)
    .eq("escrow_status", "held")
    .order("dispute_window_ends_at", { ascending: true });
  // Paid while escrow was off: due straight away (from 0116 on).
  const { data: notHeld } = queueStart
    ? await supabase
        .from("payment_events")
        .select(select)
        .eq("escrow_status", "not_applicable")
        .eq("status", "succeeded")
        .or("disbursement_status.is.null,disbursement_status.neq.succeeded")
        .gte("created_at", queueStart)
        .order("created_at", { ascending: true })
    : { data: [] };

  const all = [...(held ?? []), ...(notHeld ?? [])];
  const contractIds = [...new Set(all.map((p) => p.contract_id))];
  const { data: contracts } = contractIds.length > 0 ? await supabase.from("contracts").select("id, talent_id").in("id", contractIds) : { data: [] };
  const talentByContract = new Map((contracts ?? []).map((c) => [c.id, c.talent_id]));
  const talentIds = [...new Set((contracts ?? []).map((c) => c.talent_id))];
  const { data: methods } =
    talentIds.length > 0
      ? await supabase.from("talent_payout_methods").select("talent_id, method, phone, bank_name, account_name, account_number, name_on_account, name_checked_at").in("talent_id", talentIds)
      : { data: [] };
  const methodByTalent = new Map(
    (methods ?? []).map((m) => [m.talent_id, m as PayoutMethodRow & { talent_id: string; name_on_account: string | null; name_checked_at: string | null }])
  );
  // 0125: talent names, for the wallet name check.
  const { data: talentNames } = talentIds.length ? await createAdminClient().from("profiles").select("id, full_name").in("id", talentIds) : { data: [] as { id: string; full_name: string | null }[] };
  // Not-held payments still wait for any open dispute to be resolved.
  const { data: disputes } =
    contractIds.length > 0 ? await supabase.from("disputes").select("contract_id").in("contract_id", contractIds).neq("status", "resolved") : { data: [] };
  const disputed = new Set((disputes ?? []).map((d) => d.contract_id));

  const toRow = (p: (typeof all)[number]): PayoutRow => {
    const method = methodByTalent.get(talentByContract.get(p.contract_id) ?? "") ?? null;
    return {
      id: p.id,
      contractId: p.contract_id,
      netAmount: p.net_amount,
      currency: p.currency,
      held: p.escrow_status === "held",
      disputeWindowEndsAt: p.dispute_window_ends_at,
      disbursementStatus: p.disbursement_status,
      failureReason: p.disbursement_failure_reason,
      attempts: p.payout_attempts ?? 0,
      lastAttemptAt: p.payout_last_attempt_at,
      isSimulated: p.is_simulated,
      method: method?.method ?? null,
      payTo: describePayoutMethod(method),
      talentId: talentByContract.get(p.contract_id) ?? "",
      talentName: (talentNames ?? []).find((n) => n.id === talentByContract.get(p.contract_id))?.full_name ?? null,
      nameCheckedAt: method?.name_checked_at ?? null,
      nameOnAccount: method?.name_on_account ?? (method?.method === "bank" ? method.account_name : null),
      disputed: disputed.has(p.contract_id),
    };
  };

  const rows = all.map(toRow);

  // 0125: recent statement checks.
  const { data: runRows } = await supabase.from("reconciliation_runs").select("*").order("created_at", { ascending: false }).limit(10);
  const runs: RunView[] = (runRows ?? []).map((r) => ({
    id: r.id,
    account: r.account,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    fileName: r.file_name,
    lines: r.statement_lines,
    matched: r.matched,
    unmatched: Array.isArray(r.unmatched_statement) ? (r.unmatched_statement as RunView["unmatched"]) : [],
    missing: Array.isArray(r.missing_from_statement) ? (r.missing_from_statement as RunView["missing"]) : [],
    mismatches: Array.isArray(r.amount_mismatches) ? (r.amount_mismatches as RunView["mismatches"]) : [],
    createdAt: r.created_at,
  }));
  const stuck = rows.filter((r) => r.disbursementStatus === "pending");
  const due = rows.filter((r) => r.disbursementStatus !== "pending" && (r.held ? eligibleIds.has(r.id) : !r.disputed));
  const dueIds = new Set([...due, ...stuck].map((r) => r.id));
  const waiting = rows.filter((r) => !dueIds.has(r.id));

  return (
    <main className="mx-auto max-w-4xl p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">Payouts</h1>
      <p className="mt-1 text-sm text-slate">
        Money owed to talent, paid to the method each talent chose. MTN Mobile Money is sent from here; send mGurush and
        bank payouts yourself, then record them with the reference.{" "}
        {!escrow.enabled && <span className="font-semibold text-slate">Escrow is off — new payments are due for payout straight away.</span>}
      </p>

      <CommissionCard live={commission.live} test={commission.test} accounts={{
        mtn_momo: collection.mtn_momo ? `${collection.mtn_momo.accountName} · ${collection.mtn_momo.number}` : null,
        mgurush: collection.mgurush ? `${collection.mgurush.accountName} · ${collection.mgurush.number}` : null,
      }} />

      <StatementCheck runs={runs} canRun={canMoveMoney(session.role)} />

      <PayoutsConsole due={due} stuck={stuck} waiting={waiting} canPay={canMoveMoney(session.role)} />
    </main>
  );
}

const CHANNEL_LABEL: Record<CommissionLine["channel"], string> = {
  mtn_momo: "MTN Mobile Money",
  mgurush: "mGurush",
  bank_transfer: "Bank",
  other: "Other (old card tests)",
};

function CommissionCard({ live, test, accounts }: { live: CommissionLine[]; test: CommissionLine[]; accounts: Record<"mtn_momo" | "mgurush", string | null> }) {
  return (
    <section className="mt-6 rounded-xl border border-slate/15 bg-white p-5">
      <h2 className="text-lg font-bold text-midnight">Commission collected</h2>
      <p className="mt-1 text-sm text-slate">
        Employer fee + talent fee on every payment received. It stays in the AdorWorks account the payment landed in once
        the talent&rsquo;s share is paid out.
      </p>
      {live.length === 0 ? (
        <p className="mt-3 text-sm text-slate">No commission from real payments yet{test.length > 0 ? " (test payments are counted below)" : ""}.</p>
      ) : (
        <CommissionTable lines={live} accounts={accounts} />
      )}
      {test.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold text-slate">Test payments (no real money)</summary>
          <CommissionTable lines={test} accounts={accounts} />
        </details>
      )}
      {(!accounts.mtn_momo || !accounts.mgurush) && (
        <p className="mt-3 text-xs text-slate">
          {!accounts.mtn_momo && !accounts.mgurush ? "AdorWorks' MTN and mGurush accounts aren't" : `AdorWorks' ${!accounts.mtn_momo ? "MTN" : "mGurush"} account isn't`}{" "}
          set yet — add {!accounts.mtn_momo && !accounts.mgurush ? "them" : "it"} under{" "}
          <a href="/operations/settings" className="font-semibold text-teal-ink underline">Settings</a>.
        </p>
      )}
    </section>
  );
}

function CommissionTable({ lines, accounts }: { lines: CommissionLine[]; accounts: Record<"mtn_momo" | "mgurush", string | null> }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <thead className="text-xs text-slate">
          <tr>
            <th className="py-1 pe-3 font-semibold">Account</th>
            <th className="py-1 pe-3 font-semibold">Payments</th>
            <th className="py-1 pe-3 font-semibold">From employers</th>
            <th className="py-1 pe-3 font-semibold">From talent</th>
            <th className="py-1 font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={`${l.channel}-${l.currency}`} className="border-t border-slate/10">
              <td className="py-2 pe-3">
                <span className="font-semibold text-midnight">{CHANNEL_LABEL[l.channel]}</span>
                {(l.channel === "mtn_momo" || l.channel === "mgurush") && accounts[l.channel] && (
                  <span className="block text-xs text-slate">{accounts[l.channel]}</span>
                )}
              </td>
              <td className="py-2 pe-3">{l.payments}</td>
              <td className="py-2 pe-3">{formatMoney(l.fromEmployers, l.currency)}</td>
              <td className="py-2 pe-3">{formatMoney(l.fromTalent, l.currency)}</td>
              <td className="py-2 font-bold text-midnight">{formatMoney(l.total, l.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
