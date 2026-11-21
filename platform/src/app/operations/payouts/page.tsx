import type { Metadata } from "next";
import { requireRole, canMoveMoney } from "@/lib/dal/session";
import { staffAreaRoles } from "@/lib/domain/staffAccess";
import { createClient } from "@/lib/supabase/server";
import { getEscrowRates, getPayoutsQueueStart } from "@/lib/dal/settings";
import { PayoutsConsole, type PayoutRow } from "./payouts-console";
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
      ? await supabase.from("talent_payout_methods").select("talent_id, method, phone, bank_name, account_name, account_number").in("talent_id", talentIds)
      : { data: [] };
  const methodByTalent = new Map((methods ?? []).map((m) => [m.talent_id, m as PayoutMethodRow & { talent_id: string }]));
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
      disputed: disputed.has(p.contract_id),
    };
  };

  const rows = all.map(toRow);
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

      <PayoutsConsole due={due} stuck={stuck} waiting={waiting} canPay={canMoveMoney(session.role)} />
    </main>
  );
}
