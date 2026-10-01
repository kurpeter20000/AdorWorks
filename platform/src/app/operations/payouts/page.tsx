import type { Metadata } from "next";
import { requireRole, STAFF_ROLES } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { getEscrowRates } from "@/lib/dal/settings";
import { PayoutsConsole } from "./payouts-console";

export const metadata: Metadata = { title: "Payouts — Operations" };

/**
 * Staff console for releasing escrow-held payments (Stage 16 step 4).
 * Two lists: due now (escrow_release_eligible(), 0099 — dispute window
 * passed, no open dispute) and held but not yet due, for visibility.
 * There's no automated release job yet (see escrow.ts's own comment), so
 * this is the actual release mechanism today, not just a status screen.
 */
export default async function OperationsPayoutsPage() {
  await requireRole(...STAFF_ROLES);
  const supabase = await createClient();
  const escrow = await getEscrowRates();

  const { data: eligible } = await supabase.rpc("escrow_release_eligible");

  const { data: held } = await supabase
    .from("payment_events")
    .select("id, contract_id, net_amount, currency, dispute_window_ends_at, disbursement_status, disbursement_failure_reason")
    .eq("escrow_status", "held")
    .order("dispute_window_ends_at", { ascending: true });

  const eligibleIds = new Set((eligible ?? []).map((e) => e.payment_event_id));
  const notYetDue = (held ?? []).filter((h) => !eligibleIds.has(h.id));

  return (
    <main className="mx-auto max-w-4xl p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">Payouts</h1>
      <p className="mt-1 text-sm text-slate">
        Escrow-held milestone payments due for release to talent.{" "}
        {!escrow.enabled && <span className="font-semibold text-slate">Escrow is currently switched off — new payments release instantly.</span>}
      </p>

      <PayoutsConsole eligible={eligible ?? []} notYetDue={notYetDue} />
    </main>
  );
}
