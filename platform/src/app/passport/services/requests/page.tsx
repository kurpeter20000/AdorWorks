import type { Metadata } from "next";
import { StatusBadge } from "@/components/status-badge";
import { requireRole } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { ProposalForm } from "./proposal-form";
import { DeclineRequestButton } from "./decline-request-button";

export const metadata: Metadata = { title: "Service requests" };

const STATUS_LABEL: Record<string, { label: string; tone: "neutral" | "warning" | "success" | "danger" }> = {
  pending: { label: "Awaiting your response", tone: "warning" },
  proposed: { label: "Proposal sent", tone: "neutral" },
  accepted: { label: "Accepted", tone: "success" },
  declined: { label: "Declined", tone: "danger" },
  withdrawn: { label: "Withdrawn by employer", tone: "neutral" },
};

/** S09-04: the talent side of the service request/proposal flow — respond to employer requests. */
export default async function ServiceRequestsInboxPage() {
  const session = await requireRole("talent");
  const supabase = await createClient();

  const { data: requests } = await supabase
    .from("service_requests")
    .select("id, talent_service_id, organisation_id, message, status, created_at")
    .eq("talent_id", session.userId)
    .order("created_at", { ascending: false });

  const serviceIds = [...new Set((requests ?? []).map((r) => r.talent_service_id))];
  const { data: services } =
    serviceIds.length > 0 ? await supabase.from("talent_services").select("id, title").in("id", serviceIds) : { data: [] };
  const serviceTitleById = new Map((services ?? []).map((s) => [s.id, s.title]));

  const orgIds = [...new Set((requests ?? []).map((r) => r.organisation_id))];
  const { data: orgs } =
    orgIds.length > 0 ? await supabase.from("public_organisation_names").select("id, name").in("id", orgIds) : { data: [] };
  const orgNameById = new Map((orgs ?? []).map((o) => [o.id, o.name]));

  const requestIds = (requests ?? []).map((r) => r.id);
  const { data: proposals } =
    requestIds.length > 0
      ? await supabase.from("offers").select("id, service_request_id, compensation_amount, currency, message, status").in("service_request_id", requestIds)
      : { data: [] };
  const proposalByRequestId = new Map((proposals ?? []).filter((p) => p.service_request_id).map((p) => [p.service_request_id as string, p]));

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">Service requests</h1>
      <p className="mt-1 text-sm text-slate">Employers who&rsquo;ve requested one of your published services.</p>

      {!requests || requests.length === 0 ? (
        <p className="mt-8 text-sm text-slate">No requests yet.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {requests.map((r) => {
            const status = STATUS_LABEL[r.status] ?? { label: r.status, tone: "neutral" as const };
            const proposal = proposalByRequestId.get(r.id);
            return (
              <li key={r.id} className="rounded-xl border border-slate/15 bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-bold text-midnight">{serviceTitleById.get(r.talent_service_id) ?? "Service"}</p>
                    <p className="text-xs text-slate">{orgNameById.get(r.organisation_id) ?? "AdorWorks employer"}</p>
                  </div>
                  <StatusBadge state={{ label: status.label, tone: status.tone }} />
                </div>
                {r.message && <p className="mt-2 text-sm text-slate">&ldquo;{r.message}&rdquo;</p>}

                {r.status === "pending" && (
                  <div className="mt-3 space-y-3">
                    <ProposalForm serviceRequestId={r.id} />
                    <DeclineRequestButton requestId={r.id} />
                  </div>
                )}

                {proposal && r.status !== "pending" && (
                  <div className="mt-3 rounded-lg bg-cloud/60 p-3 text-sm">
                    <p className="font-semibold text-midnight">
                      Your proposal: {proposal.currency} {proposal.compensation_amount?.toLocaleString()}
                    </p>
                    <StatusBadge
                      className="mt-1"
                      state={
                        proposal.status === "accepted"
                          ? { label: "Accepted", tone: "success" }
                          : proposal.status === "declined"
                            ? { label: "Declined", tone: "danger" }
                            : { label: "Sent — awaiting response", tone: "neutral" }
                      }
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
