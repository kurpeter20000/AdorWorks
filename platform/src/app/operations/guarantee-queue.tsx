import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { canUseStaffArea } from "@/lib/domain/staffAccess";
import type { UserRole } from "@/lib/database.types";
import { GUARANTEE_REASONS, type GuaranteeReason } from "@/lib/domain/guarantee";
import { formatDate } from "@/lib/domain/format";
import { GuaranteeResolveForm } from "./guarantee-resolve-form";

/** Employer Guarantee requests waiting for staff (0120). Hidden when there are none. */
export async function GuaranteeQueue({ role }: { role: UserRole }) {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("guarantee_requests")
    .select("id, contract_id, organisation_id, reason, details, created_at")
    .eq("status", "open")
    .order("created_at", { ascending: true });
  if (error || !rows?.length) return null;
  const orgIds = [...new Set(rows.map((r) => r.organisation_id))];
  const { data: orgs } = await supabase.from("public_organisation_names").select("id, name").in("id", orgIds);
  const orgName = new Map((orgs ?? []).map((o) => [o.id, o.name]));
  const canResolve = canUseStaffArea(role, "opportunities");

  return (
    <section className="mt-6 rounded-xl border border-coral/30 bg-white p-5" aria-labelledby="guarantee-q-h">
      <h2 id="guarantee-q-h" className="text-lg font-bold text-midnight">
        Employer Guarantee requests ({rows.length})
      </h2>
      <p className="mt-1 text-sm text-slate">Reply within 7 days. A new shortlist is due within 10 business days of a covered request.</p>
      <ul className="mt-3 space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="rounded-lg border border-slate/15 p-3 text-sm">
            <p className="font-semibold text-midnight">
              {orgName.get(r.organisation_id) ?? "Employer"} · {GUARANTEE_REASONS[r.reason as GuaranteeReason] ?? r.reason}
            </p>
            <p className="mt-1 text-midnight">{r.details}</p>
            <p className="mt-1 text-xs text-slate">
              Received {formatDate(r.created_at)} ·{" "}
              <Link href={`/contracts/${r.contract_id}`} className="font-semibold text-teal-ink underline">
                View contract
              </Link>
            </p>
            {canResolve ? <GuaranteeResolveForm requestId={r.id} /> : <p className="mt-2 text-xs text-slate">Matchers and admins handle these.</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
