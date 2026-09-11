import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { requireSession } from "@/lib/dal/session";
import { getMyOrganisationMembership } from "@/lib/dal/organisation";
import { isStaffAccountRole } from "@/lib/domain/roles";
import { CONTRACT_STATES } from "@/lib/domain/states";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Contracts" };

// Staff already have RLS read access to every contract (0007's
// contracts_select policy) and contracts/[id]/page.tsx already lets any
// reviewer/matcher/finance/admin view a contract's full detail — this
// list just never had a branch for them, so every staff visit here
// bounced to /dashboard?error=forbidden via getMyOrganisationMembership()
// (staff aren't a CLIENT_ROLE and have no org membership) before they
// could ever reach a detail page that was already built to expect them.
const STAFF_CONTRACTS_LIMIT = 100;

export default async function ContractsPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const isStaff = isStaffAccountRole(session.role);

  let contracts;
  if (session.role === "talent") {
    ({ data: contracts } = await supabase
      .from("contracts")
      .select("id, status, started_at, completed_at, organisation_id, opportunity_id")
      .eq("talent_id", session.userId)
      .order("started_at", { ascending: false }));
  } else if (isStaff) {
    ({ data: contracts } = await supabase
      .from("contracts")
      .select("id, status, started_at, completed_at, organisation_id, opportunity_id")
      .order("started_at", { ascending: false })
      .limit(STAFF_CONTRACTS_LIMIT));
  } else {
    // Gap-check fix: this used to resolve "your org" via
    // organisations.representative_id only, so an invited (non-
    // representative) team member always saw "No contracts yet" here even
    // though RLS would happily let them read their org's real contracts.
    // getMyOrganisationMembership() is the established pattern every other
    // employer-side page already uses (organisation_members, not
    // representative_id) — this page had just never been updated to match.
    const membership = await getMyOrganisationMembership();
    ({ data: contracts } = membership
      ? await supabase
          .from("contracts")
          .select("id, status, started_at, completed_at, organisation_id, opportunity_id")
          .eq("organisation_id", membership.org.id)
          .order("started_at", { ascending: false })
      : { data: [] });
  }

  const opportunityIds = [...new Set((contracts ?? []).map((c) => c.opportunity_id))];
  const { data: opportunities } =
    opportunityIds.length > 0
      ? await supabase.from("opportunities").select("id, title").in("id", opportunityIds)
      : { data: [] };
  const titleById = new Map((opportunities ?? []).map((o) => [o.id, o.title]));

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">{isStaff ? "Contracts" : "My contracts"}</h1>
      {isStaff && (
        <p className="mt-1 text-xs text-slate">Most recent {STAFF_CONTRACTS_LIMIT} across every organisation.</p>
      )}

      {!contracts || contracts.length === 0 ? (
        <p className="mt-8 text-sm text-slate">
          {isStaff ? "No contracts exist yet." : "No contracts yet — these appear once an offer is accepted."}
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {contracts.map((c) => (
            <li key={c.id}>
              <Link
                href={`/contracts/${c.id}`}
                className="flex items-center justify-between rounded-xl border border-slate/15 bg-white p-4 hover:border-violet/40"
              >
                <p className="font-semibold text-midnight">{titleById.get(c.opportunity_id) ?? "Contract"}</p>
                <StatusBadge state={CONTRACT_STATES[c.status]} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
