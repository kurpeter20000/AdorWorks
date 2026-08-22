import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/dal/session";
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
  const session = await requireRole("individual_client");
  const { id } = await params;
  const { offered } = await searchParams;
  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organisations")
    .select("id")
    .eq("representative_id", session.userId)
    .maybeSingle();
  if (!org) {
    redirect("/organisation/setup");
  }

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
    .select("application_id, status")
    .eq("opportunity_id", opportunity.id);
  const offerByApplication = new Map((offers ?? []).map((o) => [o.application_id, o.status]));

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">{opportunity.title}</h1>
      <p className="mt-1 text-sm text-slate">Status: {opportunity.status.replace("_", " ")}</p>

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
              const offerStatus = offerByApplication.get(a.id);
              return (
                <li key={a.id} className="rounded-xl border border-slate/15 bg-white p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-midnight">
                        {talent?.display_name ?? "AdorWorks talent"}
                      </p>
                      <p className="text-xs text-slate">{talent?.headline}</p>
                    </div>
                    <span className="whitespace-nowrap rounded-full bg-cloud px-3 py-1 text-xs font-semibold text-slate">
                      {STAGE_LABEL[a.stage] ?? a.stage}
                    </span>
                  </div>

                  {offerStatus ? (
                    <p className="mt-3 text-xs font-semibold text-violet">Offer {offerStatus}</p>
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
