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
import { ArrowRight, Briefcase, Circle, FileSignature, Plus, Users, Wallet } from "lucide-react";
import { StatePanel } from "@/components/state-panel";
import { PageContainer, PageHeader, Section } from "@/components/ui/page";
import { StatTile } from "@/components/ui/stat-tile";
import { buttonVariants } from "@/components/ui/button";
import { NAV_ICONS } from "@/components/nav-icons";
import type { DashboardAction } from "@/lib/domain/navigation";
import { AssistanceConsentWidget } from "./assistance-consent-widget";
import { ReadinessPanel } from "./readiness-panel";
import { NotificationsPanel } from "./notifications-panel";
import { TalentAttentionList, RecommendedOpportunities } from "./talent-today";
import { EmployerPipelineSummary } from "./employer-today";
import { msg } from "@/i18n/config";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Dashboard") };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; onboarding?: string }>;
}) {
  const session = await requireSession();
  const query = await searchParams;
  const t = await getT();
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
  // Real counts only (see the "skip the wallet card" decision) — every
  // number here comes from a query scoped to this org, same discipline as
  // employerPipeline above. Drives the stat tiles in the employer view.
  let employerStats: { openOpportunities: number; activeContracts: number; applicantsAwaiting: number; milestonesToPay: number } | null = null;
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
      const { data: orgs, error: orgsError } = await supabase.from("public_organisation_names").select("id, name").in("id", [...new Set(ranked.map((o) => o.organisation_id))]);
      if (orgsError) todayDataError = true;
      const orgNameById = new Map((orgs ?? []).map((o) => [o.id, o.name]));
      recommendedOpportunities = ranked.map((o) => ({
        id: o.id,
        title: o.title,
        compensationLabel: t(formatCompensation(o)),
        orgName: orgNameById.get(o.organisation_id) ?? t("AdorWorks employer"),
      }));
    }

    const contractIds = (myContracts ?? []).map((c) => c.id);
    const [revisionRes, awaitingSubmissionRes, serviceRequestsRes] = await Promise.all([
      contractIds.length > 0
        ? supabase.from("milestones").select("id", { count: "exact", head: true }).in("contract_id", contractIds).eq("status", "revision_requested")
        : Promise.resolve({ count: 0, error: null }),
      // Gap: only 'revision_requested' was counted here before — a
      // milestone sitting at 'pending' (nothing submitted yet at all) is
      // equally a deliverable owed, just not previously surfaced.
      contractIds.length > 0
        ? supabase.from("milestones").select("id", { count: "exact", head: true }).in("contract_id", contractIds).eq("status", "pending")
        : Promise.resolve({ count: 0, error: null }),
      // Gap: an employer's service request sitting at 'pending' needs the
      // talent to respond with a proposal (submitServiceProposal) —
      // previously not surfaced on the dashboard at all.
      supabase.from("service_requests").select("id", { count: "exact", head: true }).eq("talent_id", session.userId).eq("status", "pending"),
    ]);
    if (revisionRes.error || awaitingSubmissionRes.error || serviceRequestsRes.error) todayDataError = true;

    const pendingOffersCount = pendingOffers ?? 0;
    const revisionCountValue = revisionRes.count ?? 0;
    const awaitingSubmissionCount = awaitingSubmissionRes.count ?? 0;
    const serviceRequestsCount = serviceRequestsRes.count ?? 0;
    const upcomingInterviewsCount = upcomingInterviews ?? 0;
    if (pendingOffersCount > 0) {
      talentAttention.push({ href: "/offers", label: msg("Offers awaiting your response"), count: pendingOffersCount, tone: "warning" });
    }
    if (serviceRequestsCount > 0) {
      talentAttention.push({ href: "/passport/services/requests", label: msg("Service requests awaiting your response"), count: serviceRequestsCount, tone: "warning" });
    }
    if (awaitingSubmissionCount > 0) {
      talentAttention.push({ href: "/contracts", label: msg("Milestones awaiting your submission"), count: awaitingSubmissionCount, tone: "info" });
    }
    if (revisionCountValue > 0) {
      talentAttention.push({ href: "/contracts", label: msg("Milestones needing a resubmission"), count: revisionCountValue, tone: "danger" });
    }
    if (upcomingInterviewsCount > 0) {
      talentAttention.push({ href: "/applications", label: msg("Upcoming interviews"), count: upcomingInterviewsCount, tone: "info" });
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
      const [milestonesToPayRes, orgMilestonesRes] = await Promise.all([
        contractIds.length > 0
          ? supabase.from("milestones").select("id", { count: "exact", head: true }).in("contract_id", contractIds).eq("status", "approved")
          : Promise.resolve({ count: 0, error: null }),
        contractIds.length > 0
          ? supabase.from("milestones").select("id").in("contract_id", contractIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (milestonesToPayRes.error || orgMilestonesRes.error) todayDataError = true;
      const milestonesToPay = milestonesToPayRes.count ?? 0;
      const offersAwaitingCount = offersAwaiting ?? 0;

      // Gap: a talent's submitted deliverable (deliverables.status =
      // 'submitted') was never queried here — only the *result* of
      // reviewing it (milestones.status = 'approved', below) showed up,
      // meaning work waiting on the employer's own review had no entry
      // until after that review already happened.
      const orgMilestoneIds = (orgMilestonesRes.data ?? []).map((m) => m.id);
      const deliverablesToReviewRes =
        orgMilestoneIds.length > 0
          ? await supabase.from("deliverables").select("id", { count: "exact", head: true }).in("milestone_id", orgMilestoneIds).eq("status", "submitted")
          : { count: 0, error: null };
      if (deliverablesToReviewRes.error) todayDataError = true;
      const deliverablesToReview = deliverablesToReviewRes.count ?? 0;

      if (applicationsAwaiting > 0) {
        employerPipeline.push({ href: "/organisation", label: msg("Applicants awaiting review"), count: applicationsAwaiting, tone: "info" });
      }
      if (deliverablesToReview > 0) {
        employerPipeline.push({ href: "/contracts", label: msg("Deliverables awaiting your review"), count: deliverablesToReview, tone: "warning" });
      }
      if (milestonesToPay > 0) {
        employerPipeline.push({ href: "/contracts", label: msg("Milestones ready to pay"), count: milestonesToPay, tone: "danger" });
      }
      if (offersAwaitingCount > 0) {
        // /offers is requireRole("talent")-only (see offers/page.tsx) --
        // there's no employer-facing cross-opportunity offers list, so this
        // used to be a dead link that bounced every employer straight back
        // to /dashboard?error=forbidden. /organisation is where an offer's
        // status is actually visible, per-opportunity (organisation/
        // opportunities/[id]/page.tsx), same destination as the applicants
        // item above. Tone/label corrected: this is waiting on the
        // *talent* to respond, not an action owed by the employer — kept
        // in the list for visibility, but as an FYI, not a same-weight
        // "you need to do this" item like the three above it.
        employerPipeline.push({ href: "/organisation", label: msg("Offers sent — awaiting talent response"), count: offersAwaitingCount, tone: "info" });
      }

      employerStats = {
        openOpportunities: opportunityCount ?? 0,
        activeContracts: (orgContracts ?? []).length,
        applicantsAwaiting: applicationsAwaiting,
        milestonesToPay,
      };
    }
  }

  const primaryAction = experience.actions.find((a) => a.primary && !a.section);
  const shortcuts = experience.actions.filter((a) => !a.section && !a.primary);
  const showShortcuts = dashboardKind !== "employer" || !employerStats;
  // Talent gets a two-column layout (today's work + profile status); other
  // roles keep a single column with their shortcuts as full cards.
  const twoColumn = dashboardKind === "talent" || (dashboardKind === "employer" && !!employerStats);

  const headerActions =
    dashboardKind === "employer" && employerStats ? (
      <>
        <Link href="/organisation" className={buttonVariants({ variant: "secondary", size: "md" })}>
          {t("Browse talent")}
        </Link>
        <Link href="/organisation/opportunities/new" className={buttonVariants({ variant: "primary", size: "md" })}>
          <Plus className="size-4" aria-hidden="true" />
          {t("Post an opportunity")}
        </Link>
      </>
    ) : primaryAction ? (
      <Link href={primaryAction.href} className={buttonVariants({ variant: "primary", size: "md" })}>
        {t(primaryAction.label)}
        <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
      </Link>
    ) : null;

  return (
    <PageContainer width="wide">
      <PageHeader
        title={session.fullName ? t("Welcome, {name}", { name: session.fullName }) : t("Welcome")}
        description={t(experience.description)}
        actions={headerActions}
      />

      {(query.error === "forbidden" || query.onboarding === "submitted" || todayDataError) && (
        <div className="mt-6 space-y-3">
          {query.error === "forbidden" && (
            <StatePanel title={t("You do not have access to that workspace")} tone="danger" role="alert">
              {t("Your account has been returned to the workspace available for its current role.")}
            </StatePanel>
          )}
          {query.onboarding === "submitted" && (
            <StatePanel title={t("Onboarding submitted")} tone="success">
              {t("Your details were received and can now move through the existing review workflow.")}
            </StatePanel>
          )}
          {todayDataError && (
            <StatePanel title={t("Couldn't load your full picture")} tone="danger" role="alert">
              {t("Some of what's below may be incomplete — refresh the page to try again.")}
            </StatePanel>
          )}
        </div>
      )}

      {pendingAssistance &&
        (pendingAssistance.status === "pending_consent" || pendingAssistance.status === "active") && (
          <AssistanceConsentWidget
            sessionId={pendingAssistance.id}
            freshAccount={!!pendingAssistance.scope.freshAccount}
            status={pendingAssistance.status}
          />
        )}

      {dashboardKind === "employer" && employerStats && (
        <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatTile label={t("Open opportunities")} value={employerStats.openOpportunities} href="/organisation" icon={Briefcase} tone="teal" />
          <StatTile label={t("Applicants awaiting")} value={employerStats.applicantsAwaiting} href="/organisation" icon={Users} tone="violet" />
          <StatTile label={t("Active contracts")} value={employerStats.activeContracts} href="/contracts" icon={FileSignature} tone="neutral" />
          <StatTile label={t("Milestones to pay")} value={employerStats.milestonesToPay} href="/contracts" icon={Wallet} tone="coral" />
        </div>
      )}

      {twoColumn ? (
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3 lg:items-start">
          <div className="min-w-0 space-y-8 lg:col-span-2">
            {dashboardKind === "talent" && (
              <>
                <Section title={t("Needs your attention")}>
                  <TalentAttentionList items={talentAttention} />
                </Section>
                <Section
                  title={t("Recommended for you")}
                  description={t("Ranked by overlap with your Passport skills — never by pay or reputation.")}
                  action={
                    <Link href="/opportunities" className="text-teal-ink hover:underline">
                      {t("See all")}
                    </Link>
                  }
                >
                  <RecommendedOpportunities opportunities={recommendedOpportunities} />
                </Section>
              </>
            )}
            {dashboardKind === "employer" && employerStats && (
              <Section title={t("Hiring priorities")}>
                <EmployerPipelineSummary items={employerPipeline} />
              </Section>
            )}
            <NotificationsPanel notifications={notifications ?? []} unreadCount={unreadCount ?? 0} />
          </div>

          <aside className="min-w-0 space-y-6">
            {readinessState && <ReadinessPanel state={readinessState} completeHref={dashboardKind === "employer" ? "/organisation/details" : "/passport"} />}
            {showShortcuts && shortcuts.length > 0 && (
              <section aria-labelledby="shortcuts-title" className="rounded-card border border-slate/10 bg-white p-5 shadow-card">
                <h2 id="shortcuts-title" className="text-base font-extrabold text-midnight">
                  {t("Shortcuts")}
                </h2>
                <ul className="mt-3 grid grid-cols-2 gap-2">
                  {shortcuts.map((action) => (
                    <li key={action.href}>
                      <ShortcutLink action={action} label={t(action.label)} compact />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          <NotificationsPanel notifications={notifications ?? []} unreadCount={unreadCount ?? 0} />
          {readinessState && <ReadinessPanel state={readinessState} completeHref={dashboardKind === "employer" ? "/organisation/details" : "/passport"} />}
          {experience.actions.length > 0 ? (
            <Section title={t(experience.title)}>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {experience.actions
                  .filter((action) => !action.section)
                  .map((action) => (
                    <li key={action.href}>
                      <ShortcutLink action={action} label={t(action.label)} description={t(action.description)} />
                    </li>
                  ))}
              </ul>
            </Section>
          ) : (
            <StatePanel title={t("Workspace unchanged")} tone="info">
              {t("This role continues in its existing operational workspace while the integrated experience is built behind feature flags.")}
            </StatePanel>
          )}
        </div>
      )}
    </PageContainer>
  );
}

/** A navigation shortcut: compact (icon + label, for the side column) or full (with description). */
function ShortcutLink({
  action,
  label,
  description,
  compact = false,
}: {
  action: DashboardAction;
  label: string;
  description?: string;
  compact?: boolean;
}) {
  const Icon = NAV_ICONS[action.href] ?? Circle;
  const className = compact
    ? "flex h-full items-center gap-2 rounded-control border border-slate/10 px-3 py-2.5 text-sm font-semibold text-midnight transition-colors hover:border-teal/40 hover:bg-teal/5"
    : "flex h-full gap-3 rounded-card border border-slate/10 bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-raised";
  const content = compact ? (
    <>
      <Icon className="size-4 shrink-0 text-teal-ink" aria-hidden="true" />
      <span className="min-w-0 leading-tight">{label}</span>
    </>
  ) : (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-teal/12 text-teal-ink">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block font-bold text-midnight">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-slate">{description}</span>}
      </span>
    </>
  );
  return action.external ? (
    <a href={action.href} target="_blank" rel="noopener noreferrer" className={className}>
      {content}
    </a>
  ) : (
    <Link href={action.href} className={className}>
      {content}
    </Link>
  );
}
