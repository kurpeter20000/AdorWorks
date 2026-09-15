import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { requireRole } from "@/lib/dal/session";
import { APPLICATION_STATES } from "@/lib/domain/states";
import { createClient } from "@/lib/supabase/server";
import { WithdrawActions } from "./withdraw-actions";
import { ApplicationThreadPanel } from "./application-thread-panel";

export const metadata: Metadata = { title: "My applications" };

const CLOSED_OPPORTUNITY_STATUSES = new Set(["closed", "cancelled", "expired", "filled"]);

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ applied?: string }>;
}) {
  const session = await requireRole("talent");
  const { applied } = await searchParams;
  const supabase = await createClient();

  const { data: applications } = await supabase
    .from("applications")
    .select("id, opportunity_id, stage, decision_reason, created_at")
    .eq("talent_id", session.userId)
    .order("created_at", { ascending: false });

  const opportunityIds = [...new Set((applications ?? []).map((a) => a.opportunity_id))];
  const { data: opportunities } =
    opportunityIds.length > 0
      ? await supabase.from("opportunities").select("id, title, organisation_id, status").in("id", opportunityIds)
      : { data: [] };

  const orgIds = [...new Set((opportunities ?? []).map((o) => o.organisation_id))];
  const { data: orgs } =
    // public_organisation_names (0072), not the RLS-gated organisations
    // table — a talent isn't a member/representative/staff of the
    // organisations they've applied to, so the base table's RLS returned
    // nothing and this silently fell back to a generic placeholder for
    // every single application (S08-05 gap-check finding).
    orgIds.length > 0 ? await supabase.from("public_organisation_names").select("id, name").in("id", orgIds) : { data: [] };

  const opportunityById = new Map((opportunities ?? []).map((o) => [o.id, o]));
  const orgNameById = new Map((orgs ?? []).map((o) => [o.id, o.name]));

  const applicationIds = (applications ?? []).map((a) => a.id);
  const { data: conversations } =
    applicationIds.length > 0
      ? await supabase.from("conversations").select("id, application_id").in("application_id", applicationIds)
      : { data: [] };
  const conversationIdByApplication = new Map(
    (conversations ?? []).filter((c): c is typeof c & { application_id: string } => c.application_id !== null).map((c) => [c.application_id, c.id])
  );
  const conversationIds = (conversations ?? []).map((c) => c.id);
  const { data: applicationMessages } =
    conversationIds.length > 0
      ? await supabase
          .from("messages")
          .select("id, conversation_id, sender_id, body, created_at")
          .in("conversation_id", conversationIds)
          .order("created_at", { ascending: true })
      : { data: [] };
  const messagesByApplication = new Map<string, NonNullable<typeof applicationMessages>>();
  for (const [applicationId, conversationId] of conversationIdByApplication) {
    messagesByApplication.set(
      applicationId,
      (applicationMessages ?? []).filter((m) => m.conversation_id === conversationId)
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-midnight">My applications</h1>
        <div className="flex items-center gap-3">
          <Link href="/opportunities/invited" className="text-sm font-semibold text-violet underline">
            Invited
          </Link>
          <Link href="/opportunities" className="text-sm font-semibold text-teal-ink underline">
            Find more work
          </Link>
        </div>
      </div>

      {applied === "1" && (
        <div className="mt-4 rounded-xl border border-teal-ink/20 bg-teal-ink/5 p-4 text-sm text-teal-ink" role="status">
          Your application was submitted. You&apos;ll see it below, and the employer will be notified.
        </div>
      )}

      {!applications || applications.length === 0 ? (
        <p className="mt-8 text-sm text-slate">
          No applications yet.{" "}
          <Link href="/opportunities" className="font-semibold text-teal-ink underline">
            Browse open opportunities
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {applications.map((a) => {
            const opp = opportunityById.get(a.opportunity_id);
            const opportunityEnded = opp ? CLOSED_OPPORTUNITY_STATUSES.has(opp.status) : false;
            return (
              <li key={a.id} className="rounded-xl border border-slate/15 bg-white p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-midnight">{opp?.title ?? "Opportunity"}</p>
                    <p className="text-xs text-slate">
                      {opp ? (orgNameById.get(opp.organisation_id) ?? "AdorWorks employer") : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge state={APPLICATION_STATES[a.stage]} />
                    <WithdrawActions applicationId={a.id} stage={a.stage} opportunityOpen={opp?.status === "open"} />
                  </div>
                </div>
                {opportunityEnded && a.stage === "rejected" && a.decision_reason && (
                  <p className="mt-2 text-xs text-slate">{a.decision_reason}</p>
                )}
                <ApplicationThreadPanel
                  applicationId={a.id}
                  currentUserId={session.userId}
                  messages={messagesByApplication.get(a.id) ?? []}
                />
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
