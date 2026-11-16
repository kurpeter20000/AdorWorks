import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { getDashboardExperience } from "@/lib/domain/navigation";
import { getDashboardKind } from "@/lib/domain/roles";
import { getTalentReadiness, getEmployerReadiness } from "@/lib/domain/readiness";
import { getMyOrganisationMembership } from "@/lib/dal/organisation";
import { rankBySkillOverlap, countSkillOverlap } from "@/lib/domain/matching";
import { formatCompensation, formatDate, formatMoney } from "@/lib/domain/format";
import { Briefcase, Circle, ClipboardList, FileCheck2, FileSignature, Mail, Plus, Search, Users, Wallet } from "lucide-react";
import { NextStepCard } from "@/components/ui/status";
import { HelpCard } from "@/components/help-card";
import { ApplicationsList, type TalentApplication } from "./applications-list";
import { OpportunitiesList, type EmployerOpportunity } from "./opportunities-list";
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
  let recommendedOpportunities: { id: string; title: string; compensationLabel: string; orgName: string; matched: number; asked: number }[] = [];
  const talentAttention: { href: string; label: string; count: number; tone: "warning" | "danger" | "info" }[] = [];
  const employerPipeline: { href: string; label: string; count: number; tone: "warning" | "danger" | "info"; meta?: string }[] = [];
  // Real counts only (see the "skip the wallet card" decision) — every
  // number here comes from a query scoped to this org, same discipline as
  // employerPipeline above. Drives the stat tiles in the employer view.
  let employerStats: { openOpportunities: number; activeContracts: number; applicantsAwaiting: number; oldestWaitingDays: number | null; milestonesToPay: number } | null = null;
  // Gap-check note: the Today widgets' whole point is asserting an absence
  // ("nothing needs your attention" / "pipeline caught up") -- a silently
  // swallowed query error would be indistinguishable from a real empty
  // state, exactly the failure mode this stage's own staff-console fix
  // (dashboard.js) was built to avoid. Tracked and surfaced below instead.
  let todayDataError = false;

  // Canvas redesign (Phase A): extra real-data reads for the new widgets.
  let talentApps: TalentApplication[] = [];
  let talentStats: { applications: number; movedForward: number; offers: number; invitations: number; pendingRelease: string | null } | null = null;
  let employerOpps: EmployerOpportunity[] = [];
  let employerInReview = 0;
  let orgName: string | null = null;
  let talentSkillCount = 0;

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
        // "Why you match": skill overlap with the Passport only — never pay.
        matched: countSkillOverlap(o.skills ?? [], talentProfile?.skills ?? []),
        asked: (o.skills ?? []).length,
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

    talentSkillCount = talentProfile?.skills?.length ?? 0;
    const [recentAppsRes, invitationsRes, financeRes] = await Promise.all([
      supabase
        .from("applications")
        .select("id, opportunity_id, stage, created_at, viewed_at")
        .eq("talent_id", session.userId)
        .neq("stage", "withdrawn")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase.from("invitations").select("id", { count: "exact", head: true }).eq("talent_id", session.userId).eq("status", "pending"),
      supabase.rpc("talent_finance_summary"),
    ]);
    if (recentAppsRes.error || invitationsRes.error || financeRes.error) todayDataError = true;
    const recentApps = recentAppsRes.data ?? [];
    if (recentApps.length > 0) {
      const { data: appOpps, error: appOppsError } = await supabase
        .from("opportunities")
        .select("id, title, organisation_id")
        .in("id", [...new Set(recentApps.map((a) => a.opportunity_id))]);
      const appOrgIds = [...new Set((appOpps ?? []).map((o) => o.organisation_id))];
      const { data: appOrgs, error: appOrgsError } =
        appOrgIds.length > 0 ? await supabase.from("public_organisation_names").select("id, name").in("id", appOrgIds) : { data: [], error: null };
      if (appOppsError || appOrgsError) todayDataError = true;
      const oppById = new Map((appOpps ?? []).map((o) => [o.id, o]));
      const appOrgName = new Map((appOrgs ?? []).map((o) => [o.id, o.name]));
      talentApps = recentApps.map((a) => {
        const opp = oppById.get(a.opportunity_id);
        return {
          id: a.id,
          title: opp?.title ?? t("Opportunity"),
          orgName: (opp && appOrgName.get(opp.organisation_id)) ?? t("AdorWorks employer"),
          stage: a.stage,
          createdAt: a.created_at,
          viewedAt: a.viewed_at ?? null,
        };
      });
    }
    const allApplications = (myApplications ?? []).length;
    const { count: movedForward } = await supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("talent_id", session.userId)
      .in("stage", ["shortlisted", "interviewing", "offered", "accepted"]);
    const pending = (financeRes.data ?? []).find((row) => row.pending_payout > 0);
    talentStats = {
      applications: allApplications,
      movedForward: movedForward ?? 0,
      offers: pendingOffersCount,
      invitations: invitationsRes.count ?? 0,
      pendingRelease: pending ? formatMoney(pending.pending_payout, pending.currency) : null,
    };
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
        supabase.from("opportunities").select("id, shortlisting_mode, title, status, type, created_at").eq("organisation_id", membership.org.id).order("created_at", { ascending: false }),
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

      // Applicant bar per opportunity (New / Shortlisted / Offered /
      // Contracted) — counts only what this employer can already see.
      orgName = membership.org.name;
      const allOrgOpps = orgOpportunities ?? [];
      employerInReview = allOrgOpps.filter((o) => o.status === "pending_review").length;
      const { data: orgApps, error: orgAppsError } =
        opportunityIds.length > 0
          ? await supabase.from("applications").select("opportunity_id, stage, stage_changed_at").in("opportunity_id", opportunityIds)
          : { data: [], error: null };
      if (orgAppsError) todayDataError = true;

      // "Applicants waiting longest" (spec next-step card): the oldest
      // application still waiting on this employer — shortlisted or in
      // interview anywhere, or new on a self-service opportunity.
      const selfService = new Set(selfServiceOpportunityIds);
      const waitingSince = (orgApps ?? [])
        .filter((a) => ["shortlisted", "interviewing"].includes(a.stage) || (a.stage === "submitted" && selfService.has(a.opportunity_id)))
        .map((a) => a.stage_changed_at)
        .sort()[0];
      const oldestWaitingDays = waitingSince ? daysSince(waitingSince) : null;
      const applicantsItem = employerPipeline.find((i) => i.label === "Applicants awaiting review");
      if (applicantsItem && oldestWaitingDays !== null) applicantsItem.meta = oldestWaitingLabel(oldestWaitingDays, t);

      // Staff asked for changes on a post (spec): the employer fixes and
      // resubmits from the opportunity's own page.
      const needsChanges = allOrgOpps.filter((o) => o.status === "changes_required");
      if (needsChanges.length > 0) {
        employerPipeline.push({
          href: needsChanges.length === 1 ? `/organisation/opportunities/${needsChanges[0].id}` : "/organisation",
          label: msg("Opportunities with changes requested"),
          count: needsChanges.length,
          tone: "warning",
          meta: needsChanges.length === 1 ? needsChanges[0].title : undefined,
        });
      }
      employerOpps = allOrgOpps
        .filter((o) => !["cancelled", "rejected"].includes(o.status))
        .slice(0, 5)
        .map((o) => {
          const apps = (orgApps ?? []).filter((a) => a.opportunity_id === o.id);
          const n = (stages: string[]) => apps.filter((a) => stages.includes(a.stage)).length;
          return {
            id: o.id,
            title: o.title,
            status: o.status,
            type: o.type,
            counts: { new: n(["submitted"]), shortlisted: n(["shortlisted", "interviewing"]), offered: n(["offered"]), contracted: n(["accepted"]) },
          };
        });

      employerStats = {
        // Was the count of ALL this org's opportunities (drafts, closed…)
        // under the label "Open opportunities"; now only published ones.
        openOpportunities: allOrgOpps.filter((o) => o.status === "open").length,
        activeContracts: (orgContracts ?? []).length,
        applicantsAwaiting: applicationsAwaiting,
        oldestWaitingDays,
        milestonesToPay,
      };
    }
  }

  const shortcuts = experience.actions.filter((a) => !a.section && !a.primary);
  const firstName = session.fullName?.trim().split(/\s+/)[0] ?? null;
  const today = formatDate(new Date(), { weekday: "long", day: "numeric", month: "long" });

  // Spec "Next-step card": the single most urgent real item, in a fixed
  // priority order per role; hidden when nothing is due. It always matches
  // the top of "Needs your attention" / "Waiting on you".
  const nextStep = pickNextStep({
    kind: dashboardKind,
    talentAttention,
    employerPipeline,
    invitations: talentStats?.invitations ?? 0,
    readinessGap: readinessState && !readinessState.readiness.complete ? readinessState.readiness.missing[0] : null,
    t,
  });

  const attentionCount = (dashboardKind === "employer" ? employerPipeline : talentAttention).length;
  const summary =
    attentionCount === 0
      ? t("You're all caught up.")
      : attentionCount === 1
        ? t("1 thing needs your attention.")
        : t("{n} things need your attention.", { n: attentionCount });

  const alerts = (query.error === "forbidden" || query.onboarding === "submitted" || todayDataError) && (
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
  );

  const assistance = pendingAssistance && (pendingAssistance.status === "pending_consent" || pendingAssistance.status === "active") && (
    <AssistanceConsentWidget sessionId={pendingAssistance.id} freshAccount={!!pendingAssistance.scope.freshAccount} status={pendingAssistance.status} />
  );

  // ---------------------------------------------------------------- talent
  if (dashboardKind === "talent") {
    return (
      <PageContainer width="wide">
        <PageHeader
          eyebrow={today}
          title={firstName ? t("Hi, {name}", { name: firstName }) : t("Welcome")}
          description={summary}
          actions={
            <>
              <Link href="/passport" className={buttonVariants({ variant: "secondary" })}>
                {t("Update Passport")}
              </Link>
              <Link href="/opportunities" className={buttonVariants({ variant: "primary" })}>
                <Search className="size-4" aria-hidden="true" />
                {t("Find work")}
              </Link>
            </>
          }
        />
        {alerts}
        {assistance}
        {nextStep && <div className="mt-6">{nextStep}</div>}

        {talentStats && (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatTile
              label={t("Applications")}
              value={talentStats.applications}
              href="/applications"
              icon={ClipboardList}
              tone="teal"
              note={talentStats.movedForward > 0 ? t("{n} moved forward", { n: talentStats.movedForward }) : t("Apply to get started")}
            />
            <StatTile
              label={t("Offers")}
              value={talentStats.offers}
              href="/offers"
              icon={FileCheck2}
              tone="coral"
              note={talentStats.offers > 0 ? t("Waiting for your answer") : t("None right now")}
            />
            <StatTile
              label={t("Invitations")}
              value={talentStats.invitations}
              href="/opportunities/invited"
              icon={Mail}
              tone="violet"
              note={talentStats.invitations > 0 ? t("An employer asked for you") : t("None right now")}
            />
            <StatTile
              label={t("Pending release")}
              value={talentStats.pendingRelease ?? 0}
              href="/finance"
              icon={Wallet}
              tone="amber"
              note={talentStats.pendingRelease ? t("Held, releasing soon") : t("Nothing held right now")}
            />
          </div>
        )}

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3 lg:items-start">
          <div className="min-w-0 space-y-8 lg:col-span-2">
            <Section
              title={t("Your applications")}
              description={t("Every application, and exactly where it stands.")}
              action={
                <Link href="/applications" className="text-teal-ink hover:underline">
                  {t("See all")}
                </Link>
              }
            >
              <ApplicationsList applications={talentApps} />
            </Section>
            <Section
              title={t("Picked for you")}
              description={
                talentSkillCount > 0
                  ? t("Ranked by overlap with your Passport skills — never by pay or reputation.")
                  : t("Add skills to your Passport to see how well you match.")
              }
              action={
                <Link href="/opportunities" className="text-teal-ink hover:underline">
                  {t("Browse all work")}
                </Link>
              }
            >
              <RecommendedOpportunities opportunities={recommendedOpportunities} />
            </Section>
            <NotificationsPanel notifications={notifications ?? []} unreadCount={unreadCount ?? 0} />
          </div>

          <aside className="min-w-0 space-y-6">
            <Section title={<span className="flex items-center gap-2">{t("Needs your attention")}{attentionCount > 0 && <CountBadge n={attentionCount} />}</span>}>
              <TalentAttentionList items={talentAttention} />
            </Section>
            {readinessState && <ReadinessPanel state={readinessState} completeHref="/passport" />}
            <HelpCard audience="talent" />
          </aside>
        </div>
      </PageContainer>
    );
  }

  // -------------------------------------------------------------- employer
  if (dashboardKind === "employer" && employerStats) {
    return (
      <PageContainer width="wide">
        <PageHeader
          eyebrow={orgName ? `${today} · ${orgName}` : today}
          title={firstName ? t("Hi, {name}", { name: firstName }) : t("Welcome")}
          description={summary}
          actions={
            <>
              <Link href="/organisation/opportunities/brief" className={buttonVariants({ variant: "secondary" })}>
                {t("Quick project brief")}
              </Link>
              <Link href="/organisation/opportunities/new" className={buttonVariants({ variant: "primary" })}>
                <Plus className="size-4" aria-hidden="true" />
                {t("Post an opportunity")}
              </Link>
            </>
          }
        />
        {alerts}
        {assistance}
        {nextStep && <div className="mt-6">{nextStep}</div>}

        <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatTile
            label={t("Open opportunities")}
            value={employerStats.openOpportunities}
            href="/organisation"
            icon={Briefcase}
            tone="teal"
            note={employerInReview > 0 ? t("{n} in staff review", { n: employerInReview }) : t("Published and taking applicants")}
          />
          <StatTile
            label={t("Applicants awaiting")}
            value={employerStats.applicantsAwaiting}
            href="/organisation"
            icon={Users}
            tone="violet"
            note={
              employerStats.applicantsAwaiting === 0
                ? t("None waiting")
                : employerStats.oldestWaitingDays !== null
                  ? oldestWaitingLabel(employerStats.oldestWaitingDays, t)
                  : t("Waiting for your decision")
            }
          />
          <StatTile label={t("Active contracts")} value={employerStats.activeContracts} href="/contracts" icon={FileSignature} tone="neutral" note={t("Work in progress")} />
          <StatTile
            label={t("Milestones to pay")}
            value={employerStats.milestonesToPay}
            href="/contracts"
            icon={Wallet}
            tone="coral"
            note={employerStats.milestonesToPay > 0 ? t("Approved, ready to pay") : t("Nothing due")}
          />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3 lg:items-start">
          <div className="min-w-0 space-y-8 lg:col-span-2">
            <Section
              title={t("Your opportunities")}
              description={t("Each one, its status, and where its applicants are.")}
              action={
                <Link href="/organisation" className="text-teal-ink hover:underline">
                  {t("See all")}
                </Link>
              }
            >
              <OpportunitiesList opportunities={employerOpps} />
            </Section>
            <NotificationsPanel notifications={notifications ?? []} unreadCount={unreadCount ?? 0} />
          </div>

          <aside className="min-w-0 space-y-6">
            <Section title={<span className="flex items-center gap-2">{t("Waiting on you")}{attentionCount > 0 && <CountBadge n={attentionCount} />}</span>}>
              <EmployerPipelineSummary items={employerPipeline} />
            </Section>
            {readinessState && <ReadinessPanel state={readinessState} completeHref="/organisation/details" />}
            <HelpCard audience="employer" />
          </aside>
        </div>
      </PageContainer>
    );
  }

  // ------------------------------------------- other roles (staff, agents…)
  return (
    <PageContainer width="wide">
      <PageHeader
        title={session.fullName ? t("Welcome, {name}", { name: session.fullName }) : t("Welcome")}
        description={t(experience.description)}
      />
      {alerts}
      {assistance}
      <div className="mt-8 space-y-8">
        <NotificationsPanel notifications={notifications ?? []} unreadCount={unreadCount ?? 0} />
        {readinessState && <ReadinessPanel state={readinessState} completeHref={dashboardKind === "employer" ? "/organisation/details" : "/passport"} />}
        {experience.actions.length > 0 ? (
          <Section title={t(experience.title)}>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(shortcuts.length > 0 ? experience.actions.filter((a) => !a.section) : experience.actions).map((action) => (
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
    </PageContainer>
  );
}

function CountBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-coral-ink px-1.5 py-0.5 text-xs font-extrabold text-white tabular-nums">{n}</span>
  );
}

type Translate = Awaited<ReturnType<typeof getT>>;

/** Fixed priority per role (spec: "Next-step card"). Returns null when nothing is due. */
function pickNextStep({
  kind,
  talentAttention,
  employerPipeline,
  invitations,
  readinessGap,
  t,
}: {
  kind: string;
  talentAttention: { href: string; label: string; count: number; meta?: string }[];
  employerPipeline: { href: string; label: string; count: number; meta?: string }[];
  invitations: number;
  readinessGap: string | null;
  t: Translate;
}) {
  const eyebrow = t("Your next step");
  const items = kind === "employer" ? employerPipeline : talentAttention;
  const find = (label: string) => items.find((i) => i.label === label && i.count > 0);
  const many = (n: number) => (n > 1 ? t("{n} waiting", { n }) : undefined);

  const rules: { label: string; title: string; cta: string; tone: "urgent" | "waiting" }[] =
    kind === "employer"
      ? [
          { label: "Milestones ready to pay", title: t("Approve and pay a milestone"), cta: t("Review and pay"), tone: "urgent" },
          { label: "Deliverables awaiting your review", title: t("Review submitted work"), cta: t("Review work"), tone: "urgent" },
          { label: "Applicants awaiting review", title: t("Decide on your applicants"), cta: t("Review applicants"), tone: "waiting" },
          { label: "Opportunities with changes requested", title: t("Staff asked for changes to your opportunity"), cta: t("Fix and resubmit"), tone: "waiting" },
        ]
      : [
          { label: "Offers awaiting your response", title: t("Respond to your offer"), cta: t("Review offer"), tone: "urgent" },
          { label: "Milestones needing a resubmission", title: t("Resubmit a milestone"), cta: t("Open contract"), tone: "urgent" },
          { label: "Upcoming interviews", title: t("Get ready for your interview"), cta: t("See details"), tone: "waiting" },
          { label: "Service requests awaiting your response", title: t("Reply to a service request"), cta: t("Respond"), tone: "waiting" },
          { label: "Milestones awaiting your submission", title: t("Submit your work for a milestone"), cta: t("Open contract"), tone: "waiting" },
        ];
  for (const rule of rules) {
    const hit = find(rule.label);
    if (hit) {
      const meta = [many(hit.count), hit.meta].filter(Boolean).join(" · ") || undefined;
      return <NextStepCard eyebrow={eyebrow} title={rule.title} meta={meta} primary={{ href: hit.href, label: rule.cta }} tone={rule.tone} />;
    }
  }
  if (kind === "talent" && invitations > 0) {
    return (
      <NextStepCard
        eyebrow={eyebrow}
        title={t("An employer invited you to apply")}
        meta={many(invitations)}
        primary={{ href: "/opportunities/invited", label: t("See invitation") }}
        tone="waiting"
      />
    );
  }
  if (readinessGap) {
    return (
      <NextStepCard
        eyebrow={t("Finish your profile")}
        title={t(readinessGap)}
        primary={{ href: kind === "employer" ? "/organisation/details" : "/passport", label: t("Do it now") }}
        tone="waiting"
      />
    );
  }
  return null;
}

/** Whole days since an ISO time (kept out of render: reads the clock). */
function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000));
}

function oldestWaitingLabel(days: number, t: Translate): string {
  if (days === 0) return t("Oldest waiting since today");
  return days === 1 ? t("Oldest waiting 1 day") : t("Oldest waiting {n} days", { n: days });
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
