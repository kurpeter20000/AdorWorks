import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireOrganisationMembership } from "@/lib/dal/organisation";
import { createClient } from "@/lib/supabase/server";
import { StatePanel } from "@/components/state-panel";
import { OpportunityForm } from "../../new/opportunity-form";

export const metadata: Metadata = { title: "Edit opportunity" };

export default async function EditOpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { org } = await requireOrganisationMembership();
  const { id } = await params;
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
  if (opportunity.status !== "changes_required" && opportunity.status !== "draft") {
    redirect(`/organisation/opportunities/${id}`);
  }
  const isBrief = opportunity.status === "draft";

  const { data: servicePackages } = await supabase
    .from("service_packages")
    .select("id, category, title, deliverable, inputs_needed, excludes")
    .eq("active", true)
    .order("category", { ascending: true })
    .order("sequence", { ascending: true });

  const { data: screeningQuestions } = await supabase
    .from("screening_questions")
    .select("question, required")
    .eq("opportunity_id", opportunity.id)
    .order("sequence", { ascending: true });

  return (
    <main className="mx-auto max-w-xl p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">
        {isBrief ? "Finish your project brief" : "Edit opportunity"}
      </h1>
      {opportunity.status_note && (
        <div className="mt-4">
          <StatePanel title="Staff requested changes" tone="info">
            {opportunity.status_note}
          </StatePanel>
        </div>
      )}
      <p className="mt-2 text-sm text-slate">
        {isBrief
          ? "Fill in the rest using the Role Canvas below, then submit for staff review."
          : "Update the details below and resubmit — staff will review it again before it goes live."}
      </p>
      <OpportunityForm
        organisationId={org.id}
        servicePackages={servicePackages ?? []}
        opportunity={opportunity}
        existingScreeningQuestions={(screeningQuestions ?? []).map((q) => ({ text: q.question, required: q.required }))}
      />
    </main>
  );
}
