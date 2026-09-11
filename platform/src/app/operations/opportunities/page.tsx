import type { Metadata } from "next";
import Link from "next/link";
import { requireRole, STAFF_ROLES } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { StatePanel } from "@/components/state-panel";
import { formatCompensation } from "@/lib/domain/format";

export const metadata: Metadata = { title: "Opportunities to review — Operations" };

export default async function OperationsOpportunitiesPage() {
  await requireRole(...STAFF_ROLES);
  const supabase = await createClient();

  const { data: opportunities, error } = await supabase
    .from("opportunities")
    .select(
      "id, title, category, engagement_type, payment_basis, compensation_amount, compensation_min, compensation_max, currency, organisation_id, created_at"
    )
    .eq("status", "pending_review")
    .order("created_at", { ascending: true });

  const orgIds = [...new Set((opportunities ?? []).map((o) => o.organisation_id))];
  const { data: orgs, error: orgsError } =
    orgIds.length > 0
      ? await supabase.from("organisations").select("id, name").in("id", orgIds)
      : { data: [], error: null };
  const orgNameById = new Map((orgs ?? []).map((o) => [o.id, o.name]));

  return (
    <main className="mx-auto max-w-5xl p-6 sm:p-8 lg:p-10">
      <Link href="/operations" className="text-xs font-semibold text-slate hover:text-midnight">
        &larr; Operations
      </Link>
      <h1 className="mt-2 text-2xl font-extrabold text-midnight">Opportunities awaiting review</h1>
      <p className="mt-1 text-sm text-slate">Oldest submissions first.</p>

      {(error || orgsError) && (
        <div className="mt-6">
          <StatePanel title="Couldn&rsquo;t load the review queue" tone="danger" role="alert">
            Refresh the page to try again.
          </StatePanel>
        </div>
      )}

      {!error && (opportunities ?? []).length === 0 && (
        <div className="mt-6">
          <StatePanel title="Nothing to review" tone="info">
            No opportunities are waiting for approval right now.
          </StatePanel>
        </div>
      )}

      {!error && (opportunities ?? []).length > 0 && (
        <ul className="mt-6 space-y-2">
          {opportunities!.map((o) => (
            <li key={o.id}>
              <Link
                href={`/operations/opportunities/${o.id}`}
                className="block rounded-xl border border-slate/15 bg-white p-4 transition-colors hover:border-teal/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="block font-bold text-midnight">{o.title}</span>
                    <span className="mt-0.5 block text-xs text-slate">
                      {orgNameById.get(o.organisation_id) ?? "Unknown organisation"} &middot;{" "}
                      {o.category ?? "Uncategorised"}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-slate">{formatCompensation(o)}</span>
                </div>
                <span className="mt-2 block text-[11px] text-slate/70">
                  Submitted {new Date(o.created_at).toLocaleDateString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
