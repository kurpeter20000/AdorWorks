import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { RespondButtons } from "./respond-buttons";

export const metadata: Metadata = { title: "Invitations" };

/** Stage 5: the "invited" feed deferred from Stage 4 — now that employer invitations (0050) exist. */
export default async function InvitedOpportunitiesPage() {
  const session = await requireRole("talent");
  const supabase = await createClient();

  const { data: invitations } = await supabase
    .from("invitations")
    .select("id, opportunity_id, message, status, created_at")
    .eq("talent_id", session.userId)
    .order("created_at", { ascending: false });

  const opportunityIds = [...new Set((invitations ?? []).map((i) => i.opportunity_id))];
  const { data: opportunities } =
    opportunityIds.length > 0
      ? await supabase.from("opportunities").select("id, title, organisation_id").in("id", opportunityIds)
      : { data: [] };
  const orgIds = [...new Set((opportunities ?? []).map((o) => o.organisation_id))];
  const { data: orgs } =
    orgIds.length > 0 ? await supabase.from("organisations").select("id, name").in("id", orgIds) : { data: [] };

  const opportunityById = new Map((opportunities ?? []).map((o) => [o.id, o]));
  const orgNameById = new Map((orgs ?? []).map((o) => [o.id, o.name]));

  const pending = (invitations ?? []).filter((i) => i.status === "pending");
  const responded = (invitations ?? []).filter((i) => i.status !== "pending");

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-midnight">Invitations</h1>
        <Link href="/applications" className="text-sm font-semibold text-teal-ink underline">
          My applications
        </Link>
      </div>
      <p className="mt-2 text-sm text-slate">Employers who&rsquo;ve asked you specifically to apply.</p>

      {pending.length === 0 ? (
        <p className="mt-8 text-sm text-slate">No pending invitations right now.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {pending.map((i) => {
            const opp = opportunityById.get(i.opportunity_id);
            return (
              <li key={i.id} className="rounded-xl border border-slate/15 bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-bold text-midnight">{opp?.title ?? "Opportunity"}</p>
                    <p className="text-xs text-slate">
                      {opp ? (orgNameById.get(opp.organisation_id) ?? "AdorWorks employer") : ""}
                    </p>
                  </div>
                  <RespondButtons invitationId={i.id} />
                </div>
                {i.message && <p className="mt-2 text-sm text-slate">{i.message}</p>}
              </li>
            );
          })}
        </ul>
      )}

      {responded.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-bold text-midnight">Past invitations</h2>
          <ul className="mt-3 space-y-2">
            {responded.map((i) => {
              const opp = opportunityById.get(i.opportunity_id);
              return (
                <li key={i.id} className="flex items-center justify-between rounded-lg border border-slate/15 bg-white p-3 text-sm">
                  <span className="text-midnight">{opp?.title ?? "Opportunity"}</span>
                  <span className="text-xs text-slate">{i.status === "accepted" ? "Accepted" : "Declined"}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </main>
  );
}
