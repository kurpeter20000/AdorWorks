import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { requireRole } from "@/lib/dal/session";
import { APPLICATION_STATES } from "@/lib/domain/states";
import { createClient } from "@/lib/supabase/server";
import { WithdrawActions } from "./withdraw-actions";
import { ApplicationThreadPanel } from "./application-thread-panel";
import { getT } from "@/i18n/server";
import { rich } from "@/i18n/rich";
import { must } from "@/lib/dal/must";
import { Stepper } from "@/components/ui/status";
import { APPLICATION_STEPS, applicationProgress } from "@/lib/domain/applicationProgress";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("My applications") };
}

/** Read once per request, outside render (React purity rule). */
function requestTime(): number {
  return Date.now();
}

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ applied?: string }>;
}) {
  const session = await requireRole("talent");
  const { applied } = await searchParams;
  const t = await getT();
  const supabase = await createClient();

  const { data: applications } = must(await supabase
    .from("applications")
    .select("id, opportunity_id, stage, decision_reason, created_at, viewed_at, stage_changed_at")
    .eq("talent_id", session.userId)
    .order("created_at", { ascending: false }), "applications");

  const opportunityIds = [...new Set((applications ?? []).map((a) => a.opportunity_id))];
  const { data: opportunities } =
    must(opportunityIds.length > 0
      ? await supabase.from("opportunities").select("id, title, organisation_id, status, shortlisting_mode").in("id", opportunityIds)
      : { data: [] }, "opportunities");

  const orgIds = [...new Set((opportunities ?? []).map((o) => o.organisation_id))];
  const { data: orgs } =
    // public_organisation_names (0072), not the RLS-gated organisations
    // table — a talent isn't a member/representative/staff of the
    // organisations they've applied to, so the base table's RLS returned
    // nothing and this silently fell back to a generic placeholder for
    // every single application (S08-05 gap-check finding).
    must(orgIds.length > 0 ? await supabase.from("public_organisation_names").select("id, name").in("id", orgIds) : { data: [] }, "orgs");

  const opportunityById = new Map((opportunities ?? []).map((o) => [o.id, o]));
  const orgNameById = new Map((orgs ?? []).map((o) => [o.id, o.name]));

  const applicationIds = (applications ?? []).map((a) => a.id);
  const { data: conversations } =
    must(applicationIds.length > 0
      ? await supabase.from("conversations").select("id, application_id").in("application_id", applicationIds)
      : { data: [] }, "conversations");
  const conversationIdByApplication = new Map(
    (conversations ?? []).filter((c): c is typeof c & { application_id: string } => c.application_id !== null).map((c) => [c.application_id, c.id])
  );
  const conversationIds = (conversations ?? []).map((c) => c.id);
  const { data: applicationMessages } =
    must(conversationIds.length > 0
      ? await supabase
          .from("messages")
          .select("id, conversation_id, sender_id, body, created_at")
          .in("conversation_id", conversationIds)
          .order("created_at", { ascending: true })
      : { data: [] }, "application messages");
  const messagesByApplication = new Map<string, NonNullable<typeof applicationMessages>>();
  for (const [applicationId, conversationId] of conversationIdByApplication) {
    messagesByApplication.set(
      applicationId,
      (applicationMessages ?? []).filter((m) => m.conversation_id === conversationId)
    );
  }

  const now = requestTime();
  const steps = APPLICATION_STEPS.map((s) => t(s));

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-midnight">{t("My applications")}</h1>
        <div className="flex items-center gap-3">
          <Link href="/opportunities/invited" className="text-sm font-semibold text-violet underline">
            {t("Invited")}
          </Link>
          <Link href="/opportunities" className="text-sm font-semibold text-teal-ink underline">
            {t("Find more work")}
          </Link>
        </div>
      </div>

      {applied === "1" && (
        <div className="mt-4 rounded-xl border border-teal-ink/20 bg-teal-ink/5 p-4 text-sm text-teal-ink" role="status">
          {t("Your application was submitted. You'll see it below, and the employer will be notified.")}
        </div>
      )}

      {!applications || applications.length === 0 ? (
        <p className="mt-8 text-sm text-slate">
          {rich(t("No applications yet. <browse>Browse open opportunities</browse>."), {
            browse: (text) => (
              <Link href="/opportunities" className="font-semibold text-teal-ink underline">
                {text}
              </Link>
            ),
          })}
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {applications.map((a) => {
            const opp = opportunityById.get(a.opportunity_id);
            const progress = applicationProgress(
              { stage: a.stage, viewedAt: a.viewed_at, stageChangedAt: a.stage_changed_at, staffAssisted: opp?.shortlisting_mode === "staff_assisted" },
              now
            );
            return (
              <li key={a.id} className="rounded-xl border border-slate/15 bg-white p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-midnight">{opp?.title ?? t("Opportunity")}</p>
                    <p className="text-xs text-slate">
                      {opp ? (orgNameById.get(opp.organisation_id) ?? t("AdorWorks employer")) : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge state={APPLICATION_STATES[a.stage]} />
                    <WithdrawActions applicationId={a.id} stage={a.stage} opportunityOpen={opp?.status === "open"} />
                  </div>
                </div>
                {progress.step !== null && (
                  <div className="mt-3 flex items-center gap-3">
                    <Stepper
                      className="w-full max-w-56"
                      steps={steps}
                      current={progress.step}
                      label={t("Step {n} of {total}: {step}", { n: progress.step + 1, total: steps.length, step: steps[progress.step] })}
                    />
                    <span className="text-xs font-semibold whitespace-nowrap text-slate">{steps[progress.step]}</span>
                  </div>
                )}
                <p className="mt-2 text-sm text-slate">
                  {progress.href ? (
                    <Link href={progress.href} className="font-semibold text-teal-ink underline">
                      {t(progress.next, progress.vars)}
                    </Link>
                  ) : (
                    t(progress.next, progress.vars)
                  )}
                </p>
                {/* The reason is written for the talent: the employer's kind
                    decline note, the 14-day auto-close note (0110) or the
                    "no longer accepting applications" cascade. */}
                {a.stage === "rejected" && a.decision_reason && (
                  <p className="mt-2 rounded-lg bg-cloud px-3 py-2 text-sm text-midnight">{a.decision_reason}</p>
                )}
                <ApplicationThreadPanel
                  applicationId={a.id}
                  conversationId={conversationIdByApplication.get(a.id) ?? null}
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
