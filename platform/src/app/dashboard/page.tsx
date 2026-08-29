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
  // Gap-check note: the Today widgets' whole point is asserting an absence
  // ("nothing needs your attention" / "pipeline caught up") -- a silently
  // swallowed query error would be indistinguishable from a real empty
  // state, exactly the failure mode this stage's own staff-console fix
  // (dashboard.js) was built to avoid. Tracked and surfaced below instead.
  let todayDataError = false;

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
    const [openOppsRes, myApplicationsRes, dismissedRes, offersRes, contractsRes, interviewsRes] = await Promise.all([
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
    if (openOppsRes.error || myApplicationsRes.error || dismissedRes.error || offersRes.error || contractsRes.error || interviewsRes.error) {
      todayDataError = true;
    }
    const openOpportunities = openOppsRes.data;
    const myApplications = myApplicationsRes.data;
    const dismissed = dismissedRes.data;
    const pendingOffers = offersRes.count;
    const myContracts = contractsRes.data;
    const upcomingInterviews = interviewsRes.count;

    const appliedOrDismissed = new Set([
      ...(myApplications ?? []).map((a) => a.opportunity_id),
      ...(dismissed ?? []).map((d) => d.opportunity_id),
    ]);
    const eligible = (openOpportunities ?? []).filter((o) => !appliedOrDismissed.has(o.id));
    const ranked = rankBySkillOverlap(eligible, talentProfile?.skills ?? []).slice(0, 3);
    if (ranked.length > 0) {
      const { data: orgs, error: orgsError } = await supabase.from("organisations").select("id, name").in("id", [...new Set(ranked.map((o) => o.organisation_id))]);
      if (orgsError) todayDataError = true;
      const orgNameById = new Map((orgs ?? []).map((o) => [o.id, o.name]));
      recommendedOpportunities = ranked.map((o) => ({
        id: o.id,
        title: o.title,
        compensationLabel: formatCompensation(o),
        orgName: orgNameById.get(o.organisation_id) ?? "AdorWorks employer",
      }));
    }

    const contractIds = (myContracts ?? []).map((c) => c.id);
    const revisionRes =
      contractIds.length > 0
        ? await supabase
            .from("milestones")
            .select("id", { count: "exact", head: true })
            .in("contract_id", contractIds)
            .eq("status", "revision_requested")
        : { count: 0, error: null };
    if (revisionRes.error) todayDataError = true;
    const revisionCount = revisionRes.count;

    const pendingOffersCount = pendingOffers ?? 0;
    const revisionCountValue = revisionCount ?? 0;
    const upcomingInterviewsCount = upcomingInterviews ?? 0;
    if (pendingOffersCount > 0) {
      talentAttention.push({ href: "/offers", label: "Offers awaiting your response", count: pendingOffersCount, tone: "warning" });
    }
    if (revisionCountValue > 0) {
      talentAttention.push({ href: "/contracts", label: "Milestones needing a resubmission", count: revisionCountValue, tone: "danger" });
    }
    if (upcomingInterviewsCount > 0) {
      talentAttention.push({ href: "/applications", label: "Upcoming interviews", count: upcomingInterviewsCount, tone: "info" });
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
      const [orgOppsRes, offersRes, orgContractsRes] = await Promise.all([
        supabase.from("opportunities").select("id, shortlisting_mode").eq("organisation_id", membership.org.id),
        supabase.from("offers").select("id", { count: "exact", head: true }).eq("organisation_id", membership.org.id).eq("status", "sent"),
        supabase.from("contracts").select("id").eq("organisation_id", membership.org.id),
      ]);
      if (orgOppsRes.error || offersRes.error || orgContractsRes.error) todayDataError = true;
      const orgOpportunities = orgOppsRes.data;
      const offersAwaiting = offersRes.count;
      const orgContracts = orgContractsRes.data;
      const opportunityIds = (orgOpportunities ?? []).map((o) => o.id);
      // Gap-check fix: this originally counted stage='submitted' only, but
      // applications_select RLS (0046) hides 'submitted' rows from the
      // employer entirely on a staff_assisted opportunity (today's default
      // mode) -- staff have to move it to 'shortlisted' first. Counting
      // just 'submitted' meant this silently read 0 for the majority of
      // opportunities even while real shortlisted candidates sat waiting on
      // an offer decision (organisation/opportunities/[id]/page.tsx renders
      // SendOfferForm for exactly shortlisted/interviewing). Now counts
      // both the true "awaiting an offer decision" state (shortlisted/
      // interviewing, any mode) and, for self-service opportunities only,
      // the raw 'submitted' pool the employer can actually see and shortlist
      // themselves.
      const selfServiceOpportunityIds = (orgOpportunities ?? [])
        .filter((o) => o.shortlisting_mode === "self_service")
        .map((o) => o.id);
      const [offerDecisionRes, selfServiceRes] = await Promise.all([
        opportunityIds.length > 0
          ? supabase
              .from("applications")
              .select("id", { count: "exact", head: true })
              .in("opportunity_id", opportunityIds)
              .in("stage", ["shortlisted", "interviewing"])
          : Promise.resolve({ count: 0, error: null }),
        selfServiceOpportunityIds.length > 0
          ? supabase
              .from("applications")
              .select("id", { count: "exact", head: true })
              .in("opportunity_id", selfServiceOpportunityIds)
              .eq("stage", "submitted")
          : Promise.resolve({ count: 0, error: null }),
      ]);
      if (offerDecisionRes.error || selfServiceRes.error) todayDataError = true;
      const applicationsAwaiting = (offerDecisionRes.count ?? 0) + (selfServiceRes.count ?? 0);
      const contractIds = (orgContracts ?? []).map((c) => c.id);
      const milestonesToPayRes =
        contractIds.length > 0
          ? await supabase
              .from("milestones")
              .select("id", { count: "exact", head: true })
              .in("contract_id", contractIds)
              .eq("status", "approved")
          : { count: 0, error: null };
      if (milestonesToPayRes.error) todayDataError = true;
      const milestonesToPay = milestonesToPayRes.count ?? 0;
      const offersAwaitingCount = offersAwaiting ?? 0;

      if (applicationsAwaiting > 0) {
        employerPipeline.push({ href: "/organisation", label: "Applicants awaiting review", count: applicationsAwaiting, tone: "info" });
      }
      if (offersAwaitingCount > 0) {
        // /offers is requireRole("talent")-only (see offers/page.tsx) --
        // there's no employer-facing cross-opportunity offers list, so this
        // used to be a dead link that bounced every employer straight back
        // to /dashboard?error=forbidden. /organisation is where an offer's
        // status is actually visible, per-opportunity (organisation/
        // opportunities/[id]/page.tsx), same destination as the applicants
        // item above.
        employerPipeline.push({ href: "/organisation", label: "Offers awaiting a response", count: offersAwaitingCount, tone: "warning" });
      }
      if (milestonesToPay > 0) {
        employerPipeline.push({ href: "/contracts", label: "Milestones ready to pay", count: milestonesToPay, tone: "danger" });
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

      {todayDataError && (
        <div className="mt-6">
          <StatePanel title="Couldn&rsquo;t load your full picture" tone="danger" role="alert">
            Some of what&rsquo;s below may be incomplete — refresh the page to try again.
          </StatePanel>
        </div>
      )}

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
