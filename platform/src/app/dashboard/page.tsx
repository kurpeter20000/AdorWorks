import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { getDashboardExperience } from "@/lib/domain/navigation";
import { getDashboardKind } from "@/lib/domain/roles";
import { getTalentReadiness, getEmployerReadiness } from "@/lib/domain/readiness";
import { getMyOrganisationMembership } from "@/lib/dal/organisation";
import { rankBySkillOverlap } from "@/lib/domain/matching";
import { formatCompensation } from "@/lib/domain/format";
import { StatePanel } from "@/components/state-panel";
import { PhoneVerificationWidget } from "./phone-verification-widget";
import { AssistanceConsentWidget } from "./assistance-consent-widget";
import { ReadinessPanel } from "./readiness-panel";
import { NotificationsPanel } from "./notifications-panel";
import { TalentAttentionList, RecommendedOpportunities } from "./talent-today";
import { EmployerPipelineSummary } from "./employer-today";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; onboarding?: string }>;
}) {
  const session = await requireSession();
  const query = await searchParams;
  const experience = getDashboardExperience(session.role);
  const dashboardKind = getDashboardKind(session.role);

  const supabase = await createClient();
  const [{ data: notifications }, { count: unreadCount }] = await Promise.all([
    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", session.userId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", session.userId)
      .is("read_at", null),
  ]);

  const { data: pendingAssistance } = await supabase
    .from("assistance_sessions")
    .select("id, scope, status")
    .eq("user_id", session.userId)
    .in("status", ["pending_consent", "active"])
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Readiness/Trust/Visibility (master doc §19A) — only computed once the
  // underlying profile exists, so a fresh signup who hasn't started
  // onboarding yet just sees the existing "Onboarding" action card
  // instead of a panel listing every field as missing.
  let readinessState = null;
  let recommendedOpportunities: { id: string; title: string; compensationLabel: string; orgName: string }[] = [];
  const talentAttention: { href: string; label: string; count: number; tone: "warning" | "danger" | "info" }[] = [];
  const employerPipeline: { href: string; label: string; count: number; tone: "warning" | "danger" | "info" }[] = [];

  if (dashboardKind === "talent") {
    const { data: talentProfile } = await supabase
      .from("talent_profiles")
      .select(
        "headline, bio, skills, category, location, avatar_path, verification_tier, public_visible, safety_orientation_completed_at"
      )
      .eq("id", session.userId)
      .maybeSingle();
    if (talentProfile) readinessState = getTalentReadiness(talentProfile);

    // Stage 8: "Today" — recommended opportunities (same fairness-ranked
    // skill-overlap rule as /opportunities?sort=relevant, see matching.ts)
    // and real, actionable counts. No invented metrics: every number below
    // is a direct query scoped to this talent.
    const [{ data: openOpportunities }, { data: myApplications }, { data: dismissed }, { count: pendingOffers }, { data: myContracts }, { count: upcomingInterviews }] =
      await Promise.all([
        supabase
          .from("opportunities")
          .select("id, title, skills, payment_basis, compensation_amount, compensation_min, compensation_max, currency, organisation_id, created_at")
          .eq("status", "open")
          .eq("visibility", "public")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase.from("applications").select("opportunity_id").eq("talent_id", session.userId),
        supabase.from("dismissed_opportunities").select("opportunity_id").eq("talent_id", session.userId),
        supabase.from("offers").select("id", { count: "exact", head: true }).eq("talent_id", session.userId).eq("status", "sent"),
        supabase.from("contracts").select("id").eq("talent_id", session.userId),
        supabase
          .from("applications")
          .select("id", { count: "exact", head: true })
          .eq("talent_id", session.userId)
          .eq("stage", "interviewing")
          .gt("interview_scheduled_at", new Date().toISOString()),
      ]);

    const appliedOrDismissed = new Set([
      ...(myApplications ?? []).map((a) => a.opportunity_id),
      ...(dismissed ?? []).map((d) => d.opportunity_id),
    ]);
    const eligible = (openOpportunities ?? []).filter((o) => !appliedOrDismissed.has(o.id));
    const ranked = rankBySkillOverlap(eligible, talentProfile?.skills ?? []).slice(0, 3);
    if (ranked.length > 0) {
      const orgIds = [...new Set(ranked.map((o) => o.organisation_id))];
      const { data: orgs } = await supabase.from("organisations").select("id, name").in("id", orgIds);
      const orgNameById = new Map((orgs ?? []).map((o) => [o.id, o.name]));
      recommendedOpportunities = ranked.map((o) => ({
        id: o.id,
        title: o.title,
        compensationLabel: formatCompensation(o),
        orgName: orgNameById.get(o.organisation_id) ?? "AdorWorks employer",
      }));
    }

    const contractIds = (myContracts ?? []).map((c) => c.id);
    const { count: revisionCount } =
      contractIds.length > 0
        ? await supabase
            .from("milestones")
            .select("id", { count: "exact", head: true })
            .in("contract_id", contractIds)
            .eq("status", "revision_requested")
        : { count: 0 };

    if ((pendingOffers ?? 0) > 0) {
      talentAttention.push({ href: "/offers", label: "Offers awaiting your response", count: pendingOffers!, tone: "warning" });
    }
    if ((revisionCount ?? 0) > 0) {
      talentAttention.push({ href: "/contracts", label: "Milestones needing a resubmission", count: revisionCount!, tone: "danger" });
    }
    if ((upcomingInterviews ?? 0) > 0) {
      talentAttention.push({ href: "/applications", label: "Upcoming interviews", count: upcomingInterviews!, tone: "info" });
    }
  } else if (dashboardKind === "employer") {
    const membership = await getMyOrganisationMembership();
    if (membership) {
      const { count: opportunityCount } = await supabase
        .from("opportunities")
        .select("id", { count: "exact", head: true })
        .eq("organisation_id", membership.org.id);
      readinessState = getEmployerReadiness(membership.org, (opportunityCount ?? 0) > 0);

      // Stage 8: hiring-priorities pipeline summary — every count scoped to
      // this org's own opportunities/offers/contracts, nothing invented.
      const [{ data: orgOpportunities }, { count: offersAwaiting }, { data: orgContracts }] = await Promise.all([
        supabase.from("opportunities").select("id").eq("organisation_id", membership.org.id),
        supabase.from("offers").select("id", { count: "exact", head: true }).eq("organisation_id", membership.org.id).eq("status", "sent"),
        supabase.from("contracts").select("id").eq("organisation_id", membership.org.id),
      ]);
      const opportunityIds = (orgOpportunities ?? []).map((o) => o.id);
      const { count: applicationsAwaiting } =
        opportunityIds.length > 0
          ? await supabase
              .from("applications")
              .select("id", { count: "exact", head: true })
              .in("opportunity_id", opportunityIds)
              .eq("stage", "submitted")
          : { count: 0 };
      const contractIds = (orgContracts ?? []).map((c) => c.id);
      const { count: milestonesToPay } =
        contractIds.length > 0
          ? await supabase
              .from("milestones")
              .select("id", { count: "exact", head: true })
              .in("contract_id", contractIds)
              .eq("status", "approved")
          : { count: 0 };

      if ((applicationsAwaiting ?? 0) > 0) {
        employerPipeline.push({ href: "/organisation", label: "Applicants awaiting review", count: applicationsAwaiting!, tone: "info" });
      }
      if ((offersAwaiting ?? 0) > 0) {
        employerPipeline.push({ href: "/offers", label: "Offers awaiting a response", count: offersAwaiting!, tone: "warning" });
      }
      if ((milestonesToPay ?? 0) > 0) {
        employerPipeline.push({ href: "/contracts", label: "Milestones ready to pay", count: milestonesToPay!, tone: "danger" });
      }
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-extrabold text-midnight">
        Welcome{session.fullName ? `, ${session.fullName}` : ""}
      </h1>

      {query.error === "forbidden" && (
        <div className="mt-6">
          <StatePanel title="You do not have access to that workspace" tone="danger" role="alert">
            Your account has been returned to the workspace available for its current role.
          </StatePanel>
        </div>
      )}

      {query.onboarding === "submitted" && (
        <div className="mt-6">
          <StatePanel title="Onboarding submitted" tone="success">
            Your details were received and can now move through the existing review workflow.
          </StatePanel>
        </div>
      )}

      {!session.phoneVerified && <PhoneVerificationWidget />}

      <NotificationsPanel notifications={notifications ?? []} unreadCount={unreadCount ?? 0} />

      {pendingAssistance &&
        (pendingAssistance.status === "pending_consent" || pendingAssistance.status === "active") && (
          <AssistanceConsentWidget
            sessionId={pendingAssistance.id}
            freshAccount={!!pendingAssistance.scope.freshAccount}
            status={pendingAssistance.status}
          />
        )}

      {readinessState && <ReadinessPanel state={readinessState} />}

      {dashboardKind === "talent" && (
        <>
          <section className="mt-6">
            <h2 className="text-lg font-extrabold text-midnight">Needs your attention</h2>
            <TalentAttentionList items={talentAttention} />
          </section>
          <section className="mt-6">
            <h2 className="text-lg font-extrabold text-midnight">Recommended for you</h2>
            <p className="mt-1 text-xs text-slate">Ranked by overlap with your Passport skills — never by pay or reputation.</p>
            <RecommendedOpportunities opportunities={recommendedOpportunities} />
          </section>
        </>
      )}

      {dashboardKind === "employer" && (
        <section className="mt-6">
          <h2 className="text-lg font-extrabold text-midnight">Hiring priorities</h2>
          <EmployerPipelineSummary items={employerPipeline} />
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-xl font-extrabold text-midnight">{experience.title}</h2>
        <p className="mt-1 text-sm text-slate">{experience.description}</p>

        {experience.actions.length > 0 ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {experience.actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className={`rounded-xl border p-4 transition-colors ${
                  action.primary
                    ? "border-teal bg-teal text-midnight hover:bg-teal/80"
                    : "border-slate/20 bg-white hover:border-teal/50"
                }`}
              >
                <span className="block font-bold">{action.label}</span>
                <span className="mt-1 block text-xs text-slate">{action.description}</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-4">
            <StatePanel title="Workspace unchanged" tone="info">
              This role continues in its existing operational workspace while the integrated experience is built behind
              feature flags.
            </StatePanel>
          </div>
        )}
      </section>
    </main>
  );
}
