import type { Metadata } from "next";
import { requireRole, STAFF_ROLES } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { InvoicesConsole } from "./invoices-console";

export const metadata: Metadata = { title: "Invoices — Operations" };

/**
 * Staff console for confirming institutional (ngo/ingo/government)
 * invoices once their bank transfer has cleared (Stage 16 step 5) —
 * confirmInstitutionalPayment() is the one place that turns an
 * institutional invoice into a real payment_events row; nothing here or
 * anywhere else lets the paying org mark its own invoice paid.
 */
export default async function OperationsInvoicesPage() {
  await requireRole(...STAFF_ROLES);
  const supabase = await createClient();

  const { data: pending } = await supabase
    .from("finance_records")
    .select("id, contract_id, milestone_id, amount, currency, due_date, payment_terms_days, created_at")
    .eq("record_type", "invoice")
    .eq("status", "pending")
    .not("payment_terms_days", "is", null)
    .order("due_date", { ascending: true });

  const contractIds = [...new Set((pending ?? []).map((p) => p.contract_id).filter((id): id is string => !!id))];
  const { data: contracts } =
    contractIds.length > 0 ? await supabase.from("contracts").select("id, organisation_id").in("id", contractIds) : { data: [] };
  const orgIdByContract = new Map((contracts ?? []).map((c) => [c.id, c.organisation_id]));
  const orgIds = [...new Set([...orgIdByContract.values()])];
  const { data: orgs } = orgIds.length > 0 ? await supabase.from("public_organisation_names").select("id, name").in("id", orgIds) : { data: [] };
  const orgNameById = new Map((orgs ?? []).map((o) => [o.id, o.name]));

  const rows = (pending ?? []).map((p) => {
    const orgId = p.contract_id ? orgIdByContract.get(p.contract_id) : null;
    return { ...p, organisationName: orgId ? (orgNameById.get(orgId) ?? "Unknown organisation") : "Unknown organisation" };
  });

  return (
    <main className="mx-auto max-w-4xl p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">Invoices</h1>
      <p className="mt-1 text-sm text-slate">Institutional invoices awaiting bank-transfer confirmation.</p>

      <InvoicesConsole rows={rows} />
    </main>
  );
}
