import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { ReportButton } from "@/components/report-button";
import { ApplyForm } from "./apply-form";

export const metadata: Metadata = { title: "Apply" };

export default async function ApplyPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("talent");
  const { id } = await params;
  const supabase = await createClient();

  const { data: opportunity } = await supabase
    .from("opportunities")
    .select("id, title, brief, organisation_id, application_deadline")
    .eq("id", id)
    .eq("status", "open")
    .eq("visibility", "public")
    .maybeSingle();
  if (!opportunity) {
    notFound();
  }

  const { data: questions } = await supabase
    .from("screening_questions")
    .select("id, question, required")
    .eq("opportunity_id", id)
    .order("sequence", { ascending: true });

  const { data: org } = await supabase
    .from("public_organisation_names")
    .select("name, verification_status")
    .eq("id", opportunity.organisation_id)
    .maybeSingle();

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">Apply — {opportunity.title}</h1>
      {org && (
        <p className="mt-1 flex items-center gap-1.5 text-sm text-slate">
          {org.name}
          {org.verification_status === "verified" && (
            <span
              className="inline-flex items-center rounded-full bg-teal-ink/10 px-1.5 py-0.5 text-[10px] font-semibold text-teal-ink"
              title="This organisation has completed AdorWorks verification."
            >
              Verified
            </span>
          )}
        </p>
      )}
      {opportunity.application_deadline && (
        <p className="mt-1 text-sm text-slate">
          Apply by {new Date(opportunity.application_deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
        </p>
      )}
      {opportunity.brief && <p className="mt-2 text-sm text-slate">{opportunity.brief}</p>}

      <ApplyForm opportunityId={opportunity.id} questions={questions ?? []} />

      <div className="mt-6 border-t border-slate/10 pt-4">
        <ReportButton targetType="opportunity" targetId={opportunity.id} />
      </div>
    </main>
  );
}
