import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ReportButton } from "@/components/report-button";
import { ShareButton } from "../../share-button";
import { ApplyForm } from "./apply-form";
import { formatDate } from "@/lib/domain/format";

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

  const { data: draft } = await supabase
    .from("application_drafts")
    .select("pitch, answers")
    .eq("opportunity_id", id)
    .maybeSingle();

  const { data: org } = await supabase
    .from("public_organisation_names")
    .select("name, verification_status")
    .eq("id", opportunity.organisation_id)
    .maybeSingle();

  // S07-11: the opportunity is already confirmed open+public above (the
  // same check the apply page has always required to render at all) — the
  // bucket itself is private, so a signed URL is the only way a talent
  // reaches these files, and only ever for an opportunity that passed the
  // same visibility check as everything else on this page.
  const admin = createAdminClient();
  const { data: attachmentRows } = await admin
    .from("opportunity_attachments")
    .select("id, path, filename")
    .eq("opportunity_id", opportunity.id)
    .order("created_at", { ascending: false });
  const attachments = await Promise.all(
    (attachmentRows ?? []).map(async (a) => {
      const { data } = await admin.storage.from("opportunity-attachments").createSignedUrl(a.path, 3600);
      return { id: a.id, filename: a.filename, url: data?.signedUrl ?? null };
    })
  );

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
          Apply by {formatDate(opportunity.application_deadline, { day: "numeric", month: "short", year: "numeric" })}
        </p>
      )}
      {opportunity.brief && <p className="mt-2 text-sm text-slate">{opportunity.brief}</p>}

      {attachments.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-midnight">Attachments</p>
          <ul className="mt-1 space-y-1">
            {attachments.map((a) =>
              a.url ? (
                <li key={a.id}>
                  <a href={a.url} className="text-sm font-semibold text-teal-ink underline" target="_blank" rel="noreferrer">
                    {a.filename}
                  </a>
                </li>
              ) : null
            )}
          </ul>
        </div>
      )}

      <ApplyForm
        opportunityId={opportunity.id}
        questions={questions ?? []}
        initialPitch={draft?.pitch ?? ""}
        initialAnswers={draft?.answers ?? {}}
      />

      <div className="mt-6 flex items-center gap-3 border-t border-slate/10 pt-4">
        <ShareButton opportunityId={opportunity.id} />
        <ReportButton targetType="opportunity" targetId={opportunity.id} />
      </div>
    </main>
  );
}
