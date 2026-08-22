import type { Metadata } from "next";
import { requireRole } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { OfferActions } from "./offer-actions";

export const metadata: Metadata = { title: "My offers" };

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Awaiting your response",
  accepted: "Accepted",
  declined: "Declined",
  withdrawn: "Withdrawn by employer",
};

export default async function OffersPage() {
  const session = await requireRole("talent");
  const supabase = await createClient();

  const { data: offers } = await supabase
    .from("offers")
    .select("id, opportunity_id, payment_basis, compensation_amount, currency, message, status, created_at")
    .eq("talent_id", session.userId)
    .order("created_at", { ascending: false });

  const opportunityIds = [...new Set((offers ?? []).map((o) => o.opportunity_id))];
  const { data: opportunities } =
    opportunityIds.length > 0
      ? await supabase.from("opportunities").select("id, title, organisation_id").in("id", opportunityIds)
      : { data: [] };
  const orgIds = [...new Set((opportunities ?? []).map((o) => o.organisation_id))];
  const { data: orgs } =
    orgIds.length > 0 ? await supabase.from("organisations").select("id, name").in("id", orgIds) : { data: [] };

  const opportunityById = new Map((opportunities ?? []).map((o) => [o.id, o]));
  const orgNameById = new Map((orgs ?? []).map((o) => [o.id, o.name]));

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">My offers</h1>

      {!offers || offers.length === 0 ? (
        <p className="mt-8 text-sm text-slate">No offers yet.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {offers.map((o) => {
            const opp = opportunityById.get(o.opportunity_id);
            return (
              <li key={o.id} className="rounded-xl border border-slate/15 bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-bold text-midnight">{opp?.title ?? "Opportunity"}</p>
                    <p className="text-xs text-slate">
                      {opp ? (orgNameById.get(opp.organisation_id) ?? "AdorWorks employer") : ""}
                    </p>
                  </div>
                  <span className="whitespace-nowrap text-sm font-semibold text-violet">
                    {o.currency} {o.compensation_amount?.toLocaleString()} ({o.payment_basis})
                  </span>
                </div>
                {o.message && <p className="mt-2 text-sm text-slate">&ldquo;{o.message}&rdquo;</p>}
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate">
                    {STATUS_LABEL[o.status] ?? o.status}
                  </span>
                  {o.status === "sent" && <OfferActions offerId={o.id} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
