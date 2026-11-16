import type { Metadata } from "next";
import { requireRole, canMoveMoney } from "@/lib/dal/session";
import { staffAreaRoles } from "@/lib/domain/staffAccess";
import { createClient } from "@/lib/supabase/server";
import { getEscrowRates } from "@/lib/dal/settings";
import { PayoutsConsole } from "./payouts-console";
import { describePayoutMethod } from "@/lib/domain/payoutMethods";

export const metadata: Metadata = { title: "Payouts — Operations" };

/**
 * Staff console for releasing escrow-held payments (Stage 16 step 4).
 * Two lists: due now (escrow_release_eligible(), 0099 — dispute window
 * passed, no open dispute) and held but not yet due, for visibility.
 * There's no automated release job yet (see escrow.ts's own comment), so
 * this is the actual release mechanism today, not just a status screen.
 */
export default async function OperationsPayoutsPage() {
  const session = await requireRole(...staffAreaRoles("payouts"));
  const supabase = await createClient();
  const escrow = await getEscrowRates();

  const { data: eligible } = await supabase.rpc("escrow_release_eligible");

  const { data: held } = await supabase
    .from("payment_events")
    .select("id, contract_id, net_amount, currency, dispute_window_ends_at, disbursement_status, disbursement_failure_reason")
    .eq("escrow_status", "held")
    .order("dispute_window_ends_at", { ascending: true });

  const eligibleIds = new Set((eligible ?? []).map((e) => e.payment_event_id));

  // 0114: where each talent wants to be paid, by contract.
  const contractIds = [...new Set([...(eligible ?? []).map((e) => e.contract_id), ...(held ?? []).map((h) => h.contract_id)])];
  const { data: contracts } = contractIds.length > 0 ? await supabase.from("contracts").select("id, talent_id").in("id", contractIds) : { data: [] };
  const talentIds = [...new Set((contracts ?? []).map((c) => c.talent_id))];
  const { data: methods } =
    talentIds.length > 0
      ? await supabase.from("talent_payout_methods").select("talent_id, method, phone, bank_name, account_name, account_number").in("talent_id", talentIds)
      : { data: [] };
  const methodByTalent = new Map((methods ?? []).map((m) => [m.talent_id, m]));
  const payTo: Record<string, string> = {};
  for (const c of contracts ?? []) payTo[c.id] = describePayoutMethod(methodByTalent.get(c.talent_id));
  const notYetDue = (held ?? []).filter((h) => !eligibleIds.has(h.id));

  return (
    <main className="mx-auto max-w-4xl p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">Payouts</h1>
      <p className="mt-1 text-sm text-slate">
        Escrow-held milestone payments due for release to talent.{" "}
        {!escrow.enabled && <span className="font-semibold text-slate">Escrow is currently switched off — new payments release instantly.</span>}
      </p>

      <PayoutsConsole eligible={eligible ?? []} notYetDue={notYetDue} canRelease={canMoveMoney(session.role)} payTo={payTo} />
    </main>
  );
}
