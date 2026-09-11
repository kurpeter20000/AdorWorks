import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole, STAFF_ROLES } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/status-badge";
import { OPPORTUNITY_STATES } from "@/lib/domain/states";
import { formatCompensation } from "@/lib/domain/format";
import { OpportunityReviewActions } from "./review-actions";

export const metadata: Metadata = { title: "Review opportunity — Operations" };

export default async function OperationsOpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(...STAFF_ROLES);
  const { id } = await params;
  const supabase = await createClient();

  const { data: opportunity } = await supabase.from("opportunities").select("*").eq("id", id).maybeSingle();
  if (!opportunity) notFound();

  const { data: organisation } = await supabase
    .from("organisations")
    .select("id, name, sector, verification_status")
    .eq("id", opportunity.organisation_id)
    .maybeSingle();

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <Link href="/operations/opportunities" className="text-xs font-semibold text-slate hover:text-midnight">
        &larr; Opportunities to review
      </Link>

      <h1 className="mt-2 text-2xl font-extrabold text-midnight">{opportunity.title}</h1>
      <div className="mt-2">
        <StatusBadge state={OPPORTUNITY_STATES[opportunity.status]} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs font-semibold text-slate">Organisation</dt>
          <dd className="text-midnight">{organisation?.name ?? "Unknown"}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-slate">Org verification</dt>
          <dd className="text-midnight capitalize">{organisation?.verification_status ?? "unknown"}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-slate">Category</dt>
          <dd className="text-midnight">{opportunity.category ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-slate">Engagement</dt>
          <dd className="text-midnight">{opportunity.engagement_type ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-slate">Compensation</dt>
          <dd className="text-midnight">{formatCompensation(opportunity)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-slate">Work mode</dt>
          <dd className="text-midnight">{opportunity.work_mode ?? "—"}</dd>
        </div>
      </dl>

      {opportunity.brief && (
        <div className="mt-4">
          <h2 className="text-xs font-semibold text-slate">Brief</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-midnight">{opportunity.brief}</p>
        </div>
      )}

      {opportunity.skills.length > 0 && (
        <div className="mt-4">
          <h2 className="text-xs font-semibold text-slate">Skills</h2>
          <p className="mt-1 text-sm text-midnight">{opportunity.skills.join(", ")}</p>
        </div>
      )}

      {opportunity.status === "pending_review" ? (
        <OpportunityReviewActions opportunityId={opportunity.id} />
      ) : (
        <p className="mt-6 rounded-lg bg-slate/10 px-4 py-3 text-sm text-slate">
          This opportunity is no longer waiting for review (status: {OPPORTUNITY_STATES[opportunity.status].label}).
        </p>
      )}
    </main>
  );
}
