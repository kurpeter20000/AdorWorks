import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { requireOrganisationMembership } from "@/lib/dal/organisation";
import { createClient } from "@/lib/supabase/server";
import { ProposalResponseActions } from "./proposal-response-actions";
import { WithdrawRequestButton } from "./withdraw-request-button";

export const metadata: Metadata = { title: "Service requests" };

const STATUS_LABEL: Record<string, { label: string; tone: "neutral" | "warning" | "success" | "danger" }> = {
  pending: { label: "Awaiting response", tone: "neutral" },
  proposed: { label: "Proposal received", tone: "warning" },
  accepted: { label: "Accepted", tone: "success" },
  declined: { label: "Declined", tone: "danger" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};

/** S09-03/S09-04/S09-05: the employer side of the service request/proposal/offer flow. */
export default async function ServiceRequestsPage() {
  const { org } = await requireOrganisationMembership();
  const supabase = await createClient();

  const { data: requests } = await supabase
    .from("service_requests")
    .select("id, talent_service_id, talent_id, message, status, created_at")
    .eq("organisation_id", org.id)
    .order("created_at", { ascending: false });

  const serviceIds = [...new Set((requests ?? []).map((r) => r.talent_service_id))];
  const { data: services } =
    serviceIds.length > 0 ? await supabase.from("talent_services").select("id, title").in("id", serviceIds) : { data: [] };
  const serviceTitleById = new Map((services ?? []).map((s) => [s.id, s.title]));

  const talentIds = [...new Set((requests ?? []).map((r) => r.talent_id))];
  const { data: talents } =
    talentIds.length > 0 ? await supabase.from("public_talent_profiles").select("id, display_name, headline").in("id", talentIds) : { data: [] };
  const talentById = new Map((talents ?? []).map((t) => [t.id, t]));

  const requestIds = (requests ?? []).map((r) => r.id);
  const { data: proposals } =
    requestIds.length > 0
      ? await supabase
          .from("offers")
          .select("id, service_request_id, compensation_amount, currency, message, status")
          .in("service_request_id", requestIds)
      : { data: [] };
  const proposalByRequestId = new Map((proposals ?? []).filter((p) => p.service_request_id).map((p) => [p.service_request_id as string, p]));

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">Service requests</h1>
      <p className="mt-1 text-sm text-slate">
        Requests you&rsquo;ve sent to talent for their published services, and their proposals in response.
      </p>

      {!requests || requests.length === 0 ? (
        <p className="mt-8 text-sm text-slate">
          No requests yet.{" "}
          <Link href="/services" className="font-semibold text-teal-ink underline">
            Browse services
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {requests.map((r) => {
            const talent = talentById.get(r.talent_id);
            const proposal = proposalByRequestId.get(r.id);
            const status = STATUS_LABEL[r.status] ?? { label: r.status, tone: "neutral" as const };
            return (
              <li key={r.id} className="rounded-xl border border-slate/15 bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-bold text-midnight">{serviceTitleById.get(r.talent_service_id) ?? "Service"}</p>
                    {talent && (
                      <Link href={`/passport/${talent.id}`} className="text-xs text-slate underline decoration-slate/30 hover:decoration-teal">
                        {talent.display_name ?? talent.headline ?? "AdorWorks talent"}
                      </Link>
                    )}
                  </div>
                  <StatusBadge state={{ label: status.label, tone: status.tone }} />
                </div>
                {r.message && <p className="mt-2 text-sm text-slate">&ldquo;{r.message}&rdquo;</p>}

                {proposal && (
                  <div className="mt-3 rounded-lg bg-cloud/60 p-3">
                    <p className="text-sm font-semibold text-midnight">
                      Proposed: {proposal.currency} {proposal.compensation_amount?.toLocaleString()}
                    </p>
                    {proposal.message && <p className="mt-1 text-sm text-slate">{proposal.message}</p>}
                    {proposal.status === "sent" && <ProposalResponseActions offerId={proposal.id} />}
                    {proposal.status === "accepted" && (
                      <p className="mt-2 text-xs font-semibold text-teal-ink">Accepted — check Contracts for delivery.</p>
                    )}
                  </div>
                )}

                {r.status === "pending" && <WithdrawRequestButton requestId={r.id} organisationId={org.id} />}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
