import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { requireSession } from "@/lib/dal/session";
import { CONTRACT_STATES } from "@/lib/domain/states";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My contracts" };

export default async function ContractsPage() {
  const session = await requireSession();
  const supabase = await createClient();

  let contracts;
  if (session.role === "talent") {
    ({ data: contracts } = await supabase
      .from("contracts")
      .select("id, status, started_at, completed_at, organisation_id, opportunity_id")
      .eq("talent_id", session.userId)
      .order("started_at", { ascending: false }));
  } else {
    const { data: org } = await supabase
      .from("organisations")
      .select("id")
      .eq("representative_id", session.userId)
      .maybeSingle();
    ({ data: contracts } = org
      ? await supabase
          .from("contracts")
          .select("id, status, started_at, completed_at, organisation_id, opportunity_id")
          .eq("organisation_id", org.id)
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
      <h1 className="text-2xl font-extrabold text-midnight">My contracts</h1>

      {!contracts || contracts.length === 0 ? (
        <p className="mt-8 text-sm text-slate">
          No contracts yet — these appear once an offer is accepted.
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
