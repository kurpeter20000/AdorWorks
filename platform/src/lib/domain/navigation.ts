import type { UserRole } from "@/lib/database.types";
import { getDashboardKind, type DashboardKind } from "./roles";
import { msg } from "@/i18n/config";
import { canOpenStaffPath } from "./staffAccess";

export interface DashboardAction {
  href: string;
  label: string;
  description: string;
  primary?: boolean;
  /** Opens in a new tab instead of client-side routing — for links to a different deployment (e.g. the staff console) rather than a route in this app. */
  external?: boolean;
  /** Setup/help links, left off the dashboard's shortcut grid (they live in the menu and the help card). */
  section?: "support";
  /**
   * Sidebar heading this link sits under. Pages are grouped by the job
   * people are doing (canvas Foundations: "Find work, My work, Money,
   * Profile, Help"), so the menu reads as tasks, not a flat list.
   * Ungrouped links render at the top, under the Dashboard link.
   */
  group?: string;
}

export interface DashboardExperience {
  kind: DashboardKind;
  title: string;
  description: string;
  actions: readonly DashboardAction[];
}

const experiences: Record<DashboardKind, Omit<DashboardExperience, "kind">> = {
  talent: {
    title: msg("Build your career on AdorWorks"),
    description: msg("Keep your Passport current, discover paid work, and manage applications and delivery."),
    // Notifications isn't listed: the bell in the top bar (with its unread
    // count) is the one entry point, on every screen size.
    actions: [
      { href: "/opportunities", label: msg("Find work"), description: msg("Browse open, paid opportunities."), primary: true, group: msg("Find work") },
      { href: "/opportunities/saved", label: msg("Saved"), description: msg("Return to opportunities saved for later."), group: msg("Find work") },
      { href: "/opportunities/invited", label: msg("Invitations"), description: msg("Employers who've asked you specifically to apply."), group: msg("Find work") },
      { href: "/applications", label: msg("Applications"), description: msg("Track the applications you have submitted."), group: msg("My work") },
      { href: "/offers", label: msg("Offers"), description: msg("Review and respond to offers."), group: msg("My work") },
      { href: "/contracts", label: msg("Contracts"), description: msg("Deliver work, message clients, and view payments."), group: msg("My work") },
      { href: "/passport/services/requests", label: msg("Service requests"), description: msg("Respond to employers who've requested one of your services."), group: msg("My work") },
      { href: "/finance", label: msg("Finance"), description: msg("What you've earned and what's pending release."), group: msg("Money") },
      { href: "/passport", label: msg("Your Passport"), description: msg("Manage your photo, links, evidence, and portfolio."), group: msg("Profile") },
      { href: "/onboarding", label: msg("Profile setup"), description: msg("Complete or review your verification steps."), section: "support", group: msg("Profile") },
      { href: "/support", label: msg("Message support"), description: msg("Talk directly with AdorWorks staff."), section: "support", group: msg("Help") },
      { href: "/assistance/request", label: msg("In-person help"), description: msg("Get someone to help you finish your profile at a partner hub."), section: "support", group: msg("Help") },
      { href: "/trust-safety", label: msg("Trust & Safety"), description: msg("Free orientation on staying safe on AdorWorks."), section: "support", group: msg("Help") },
    ],
  },
  employer: {
    title: msg("Hire and manage work on AdorWorks"),
    description: msg("Manage your organisation, publish paid opportunities, review candidates, and oversee delivery."),
    actions: [
      { href: "/organisation", label: msg("Your opportunities"), description: msg("Your opportunities and their applicants."), primary: true, group: msg("Hire") },
      { href: "/organisation/opportunities/new", label: msg("Post an opportunity"), description: msg("Submit a paid role or project for review."), group: msg("Hire") },
      { href: "/organisation/opportunities/brief", label: msg("Quick project brief"), description: msg("Just have an outcome in mind? Save a short brief and fill in the rest later."), group: msg("Hire") },
      { href: "/services", label: msg("Browse services"), description: msg("Discover defined, ready-to-book services from AdorWorks talent."), group: msg("Services") },
      { href: "/organisation/service-requests", label: msg("Service requests"), description: msg("Track requests you've sent to talent and their proposals."), group: msg("Services") },
      { href: "/contracts", label: msg("Contracts"), description: msg("Manage active and completed work."), group: msg("Work and pay") },
      { href: "/finance", label: msg("Finance"), description: msg("Spend, pending invoices, and milestones owed."), group: msg("Work and pay") },
      { href: "/organisation/details", label: msg("Organisation details"), description: msg("Name, sector, website and billing details."), section: "support", group: msg("Organisation") },
      { href: "/organisation/verification", label: msg("Verification"), description: msg("Registration evidence and verification status."), section: "support", group: msg("Organisation") },
      { href: "/organisation/team", label: msg("Team"), description: msg("Review organisation membership and access."), group: msg("Organisation") },
      { href: "/organisation/activity", label: msg("Activity"), description: msg("Who on your team did what, and when."), section: "support", group: msg("Organisation") },
      { href: "/support", label: msg("Message support"), description: msg("Talk directly with AdorWorks staff."), section: "support", group: msg("Help") },
      { href: "/assistance/request", label: msg("In-person help"), description: msg("Get someone to help you finish your profile at a partner hub."), section: "support", group: msg("Help") },
    ],
  },
  assistance: {
    title: msg("Assisted onboarding"),
    description: msg("Continue only the consented, scoped assistance sessions assigned to you."),
    actions: [
      { href: "/assist", label: msg("Assistance sessions"), description: msg("Open your assigned sessions."), primary: true },
    ],
  },
  operations: {
    title: msg("AdorWorks Operations"),
    description:
      "The staff console: review queues, verification, matching, delivery, disputes, finance and accounts — all in one place.",
    // The single staff console. Everything the old static /staff site did
    // now lives under /operations; there is no second console to link to.
    actions: [
      { href: "/operations", label: msg("Operations"), description: msg("Live queue counts across every staff area."), primary: true },
      { href: "/operations/intake", label: msg("Intake"), description: msg("Triage public-form submissions and convert them into real accounts.") },
      { href: "/operations/talent", label: msg("Talent"), description: msg("Review evidence and videos, set verification tiers and visibility.") },
      { href: "/operations/organisations", label: msg("Organisations"), description: msg("Record employer verification checks and risk flags.") },
      { href: "/operations/opportunities", label: msg("Opportunities"), description: msg("Approve briefs, build shortlists and start engagements.") },
      { href: "/operations/services", label: msg("Services"), description: msg("Publish, reject or pause talent-authored services.") },
      { href: "/operations/reports", label: msg("Reports"), description: msg("Handle listings and profiles flagged by users.") },
      { href: "/operations/engagements", label: msg("Engagements"), description: msg("Delivery tracking, milestones, finance records and disputes.") },
      { href: "/operations/contracts", label: msg("Contracts"), description: msg("Contract oversight: disputes, refunds and invoice reconciliation.") },
      { href: "/operations/assisted-onboarding", label: msg("Assisted onboarding"), description: msg("Partner hubs, onboarding agents and in-person help requests.") },
      { href: "/operations/people", label: msg("People"), description: msg("Find a person by name, email, phone or ID; notes, suspensions, appeals and staff roles.") },
      { href: "/operations/invoices", label: msg("Invoices"), description: msg("Institutional invoices awaiting bank-transfer confirmation.") },
      { href: "/operations/payouts", label: msg("Payouts"), description: msg("Escrow-held milestone payments due for release to talent.") },
      { href: "/operations/settings", label: msg("Settings"), description: msg("Platform fees and other settings (finance and admins).") },
      { href: "/operations/support", label: msg("Support"), description: msg("Reply to users messaging AdorWorks staff directly.") },
    ],
  },
  partner: {
    title: msg("Partner workspace"),
    description: msg("Partner-hub administration is not yet available in the authenticated platform."),
    actions: [],
  },
};

export function getDashboardExperience(role: UserRole): DashboardExperience {
  const kind = getDashboardKind(role);
  const experience = experiences[kind];
  if (kind !== "operations") return { kind, ...experience };
  // Each staff role sees only the areas it works (lib/domain/staffAccess).
  return { kind, ...experience, actions: experience.actions.filter((a) => canOpenStaffPath(role, a.href)) };
}

export interface NavLink {
  href: string;
  label: string;
}

// Stage 8: a short, curated set for the persistent top nav — distinct
// from the full `experiences[kind].actions` list above (which stays the
// exhaustive dashboard card grid). Kept small deliberately: a nav bar
// that lists everything isn't navigation, it's the dashboard again.
const primaryNavLinks: Record<DashboardKind, readonly NavLink[]> = {
  talent: [
    { href: "/opportunities", label: msg("Find work") },
    { href: "/applications", label: msg("Applications") },
    { href: "/contracts", label: msg("Contracts") },
    { href: "/passport", label: msg("Passport") },
  ],
  employer: [
    { href: "/organisation", label: msg("Organisation") },
    { href: "/contracts", label: msg("Contracts") },
    { href: "/services", label: msg("Services") },
  ],
  assistance: [{ href: "/assist", label: msg("Assistance sessions") }],
  operations: [],
  partner: [],
};

export function getPrimaryNavLinks(role: UserRole): readonly NavLink[] {
  return primaryNavLinks[getDashboardKind(role)];
}
