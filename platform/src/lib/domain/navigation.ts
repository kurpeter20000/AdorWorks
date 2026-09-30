import type { UserRole } from "@/lib/database.types";
import { getDashboardKind, type DashboardKind } from "./roles";

export interface DashboardAction {
  href: string;
  label: string;
  description: string;
  primary?: boolean;
  /** Opens in a new tab instead of client-side routing — for links to a different deployment (e.g. the staff console) rather than a route in this app. */
  external?: boolean;
  /** Setup/help links, grouped under "Support" at the foot of the sidebar and left off the dashboard's action grid. */
  section?: "support";
}

export interface DashboardExperience {
  kind: DashboardKind;
  title: string;
  description: string;
  actions: readonly DashboardAction[];
}

const experiences: Record<DashboardKind, Omit<DashboardExperience, "kind">> = {
  talent: {
    title: "Build your career on AdorWorks",
    description: "Keep your Passport current, discover paid work, and manage applications and delivery.",
    // Notifications isn't listed: the bell in the top bar (with its unread
    // count) is the one entry point, on every screen size.
    actions: [
      { href: "/opportunities", label: "Find work", description: "Browse open, paid opportunities.", primary: true },
      { href: "/opportunities/saved", label: "Saved", description: "Return to opportunities saved for later." },
      { href: "/applications", label: "Applications", description: "Track the applications you have submitted." },
      { href: "/opportunities/invited", label: "Invitations", description: "Employers who've asked you specifically to apply." },
      { href: "/offers", label: "Offers", description: "Review and respond to offers." },
      { href: "/contracts", label: "Contracts", description: "Deliver work, message clients, and view payments." },
      { href: "/passport/services/requests", label: "Service requests", description: "Respond to employers who've requested one of your services." },
      { href: "/passport", label: "Your Passport", description: "Manage your photo, links, evidence, and portfolio." },
      { href: "/onboarding", label: "Profile setup", description: "Complete or review your verification steps.", section: "support" },
      { href: "/trust-safety", label: "Trust & Safety", description: "Free orientation on staying safe on AdorWorks.", section: "support" },
      { href: "/assistance/request", label: "In-person help", description: "Get someone to help you finish your profile at a partner hub.", section: "support" },
    ],
  },
  employer: {
    title: "Hire and manage work on AdorWorks",
    description: "Manage your organisation, publish paid opportunities, review candidates, and oversee delivery.",
    actions: [
      { href: "/organisation", label: "Organisation", description: "Open your organisation workspace.", primary: true },
      { href: "/organisation/opportunities/new", label: "Post an opportunity", description: "Submit a paid role or project for review." },
      { href: "/organisation/opportunities/brief", label: "Quick project brief", description: "Just have an outcome in mind? Save a short brief and fill in the rest later." },
      { href: "/services", label: "Browse services", description: "Discover defined, ready-to-book services from AdorWorks talent." },
      { href: "/organisation/service-requests", label: "Service requests", description: "Track requests you've sent to talent and their proposals." },
      { href: "/organisation/team", label: "Team", description: "Review organisation membership and access." },
      { href: "/contracts", label: "Contracts", description: "Manage active and completed work." },
      { href: "/assistance/request", label: "In-person help", description: "Get someone to help you finish your profile at a partner hub.", section: "support" },
    ],
  },
  assistance: {
    title: "Assisted onboarding",
    description: "Continue only the consented, scoped assistance sessions assigned to you.",
    actions: [
      { href: "/assist", label: "Assistance sessions", description: "Open your assigned sessions.", primary: true },
    ],
  },
  operations: {
    title: "AdorWorks Operations",
    description:
      "The staff console: review queues, verification, matching, delivery, disputes, finance and accounts — all in one place.",
    // The single staff console. Everything the old static /staff site did
    // now lives under /operations; there is no second console to link to.
    actions: [
      { href: "/operations", label: "Operations", description: "Live queue counts across every staff area.", primary: true },
      { href: "/operations/intake", label: "Intake", description: "Triage public-form submissions and convert them into real accounts." },
      { href: "/operations/talent", label: "Talent", description: "Review evidence and videos, set verification tiers and visibility." },
      { href: "/operations/organisations", label: "Organisations", description: "Record employer verification checks and risk flags." },
      { href: "/operations/opportunities", label: "Opportunities", description: "Approve briefs, build shortlists and start engagements." },
      { href: "/operations/services", label: "Services", description: "Publish, reject or pause talent-authored services." },
      { href: "/operations/reports", label: "Reports", description: "Handle listings and profiles flagged by users." },
      { href: "/operations/engagements", label: "Engagements", description: "Delivery tracking, milestones, finance records and disputes." },
      { href: "/operations/contracts", label: "Contracts", description: "Contract oversight: disputes, refunds and invoice reconciliation." },
      { href: "/operations/assisted-onboarding", label: "Assisted onboarding", description: "Partner hubs, onboarding agents and in-person help requests." },
      { href: "/operations/people", label: "People", description: "Accounts, roles, suspensions and staff (admins only)." },
    ],
  },
  partner: {
    title: "Partner workspace",
    description: "Partner-hub administration is not yet available in the authenticated platform.",
    actions: [],
  },
};

export function getDashboardExperience(role: UserRole): DashboardExperience {
  const kind = getDashboardKind(role);
  return { kind, ...experiences[kind] };
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
    { href: "/opportunities", label: "Find work" },
    { href: "/applications", label: "Applications" },
    { href: "/contracts", label: "Contracts" },
    { href: "/passport", label: "Passport" },
  ],
  employer: [
    { href: "/organisation", label: "Organisation" },
    { href: "/contracts", label: "Contracts" },
    { href: "/services", label: "Services" },
  ],
  assistance: [{ href: "/assist", label: "Assistance sessions" }],
  operations: [],
  partner: [],
};

export function getPrimaryNavLinks(role: UserRole): readonly NavLink[] {
  return primaryNavLinks[getDashboardKind(role)];
}
