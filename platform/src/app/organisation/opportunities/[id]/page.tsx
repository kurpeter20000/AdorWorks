import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrganisationMembership } from "@/lib/dal/organisation";
import { createClient } from "@/lib/supabase/server";
import { SendOfferForm } from "./send-offer-form";

export const metadata: Metadata = { title: "Opportunity" };

const STAGE_LABEL: Record<string, string> = {
  shortlisted: "Shortlisted",
  interviewing: "Interviewing",
  offered: "Offer sent",
  accepted: "Accepted",
  rejected: "Not selected",
  withdrawn: "Withdrawn",
};

export default async function OpportunityDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ offered?: string }>;
}) {
  const { org } = await requireOrganisationMembership();
  const { id } = await params;
  const { offered } = await searchParams;
  const supabase = await createClient();

  const { data: opportunity } = await supabase
    .from("opportunities")
    .select("*")
    .eq("id", id)
    .eq("organisation_id", org.id)
    .maybeSingle();
  if (!opportunity) {
    notFound();
  }

  const { data: applications } = await supabase
    .from("applications")
    .select("id, talent_id, stage, created_at")
    .eq("opportunity_id", opportunity.id)
    .order("created_at", { ascending: false });

  const talentIds = [...new Set((applications ?? []).map((a) => a.talent_id))];
  const { data: talents } =
    talentIds.length > 0
      ? await supabase.from("talent_profiles").select("id, display_name, headline").in("id", talentIds)
      : { data: [] };
  const talentById = new Map((talents ?? []).map((t) => [t.id, t]));

  const { data: offers } = await supabase
    .from("offers")
    .select("id, application_id, status")
    .eq("opportunity_id", opportunity.id);
  const offerByApplication = new Map((offers ?? []).map((o) => [o.application_id, o]));

  const offerIds = (offers ?? []).map((o) => o.id);
  const { data: contracts } =
    offerIds.length > 0
      ? await supabase.from("contracts").select("id, offer_id").in("offer_id", offerIds)
      : { data: [] };
  const contractIdByOffer = new Map((contracts ?? []).map((c) => [c.offer_id, c.id]));

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">{opportunity.title}</h1>
      <p className="mt-1 text-sm text-slate">Status: {opportunity.status.replace("_", " ")}</p>

      {opportunity.status === "rejected" && opportunity.rejection_reason && (
        <p className="mt-4 rounded-lg bg-coral/10 px-4 py-3 text-sm text-coral">
          Not approved: {opportunity.rejection_reason}
        </p>
      )}

      {offered && (
        <p className="mt-4 rounded-lg bg-teal/10 px-4 py-3 text-sm font-semibold text-teal">
          Offer sent.
        </p>
      )}

      <div className="mt-8">
        <h2 className="font-bold text-midnight">Applicants</h2>
        <p className="mt-1 text-xs text-slate">
          Only shows once AdorWorks staff have shortlisted an applicant — this is the same
          curated-shortlist review every opportunity goes through.
        </p>

        {!applications || applications.length === 0 ? (
          <p className="mt-4 text-sm text-slate">No shortlisted applicants yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {applications.map((a) => {
              const talent = talentById.get(a.talent_id);
              const offer = offerByApplication.get(a.id);
              const contractId = offer ? contractIdByOffer.get(offer.id) : undefined;
              return (
                <li key={a.id} className="rounded-xl border border-slate/15 bg-white p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      {talent ? (
                        <Link
                          href={`/passport/${talent.id}`}
                          className="font-semibold text-midnight underline decoration-slate/30 hover:decoration-teal"
                        >
                          {talent.display_name ?? "AdorWorks talent"}
                        </Link>
                      ) : (
                        <p className="font-semibold text-midnight">AdorWorks talent</p>
                      )}
                      <p className="text-xs text-slate">{talent?.headline}</p>
                    </div>
                    <span className="whitespace-nowrap rounded-full bg-cloud px-3 py-1 text-xs font-semibold text-slate">
                      {STAGE_LABEL[a.stage] ?? a.stage}
                    </span>
                  </div>

                  {contractId ? (
                    <Link
                      href={`/contracts/${contractId}`}
                      className="mt-3 inline-block text-xs font-semibold text-teal underline"
                    >
                      View contract
                    </Link>
                  ) : offer ? (
                    <p className="mt-3 text-xs font-semibold text-violet">Offer {offer.status}</p>
                  ) : ["shortlisted", "interviewing"].includes(a.stage) ? (
                    <SendOfferForm applicationId={a.id} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
