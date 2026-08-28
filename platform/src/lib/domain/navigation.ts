import type { UserRole } from "@/lib/database.types";
import { getDashboardKind, type DashboardKind } from "./roles";

export interface DashboardAction {
  href: string;
  label: string;
  description: string;
  primary?: boolean;
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
    actions: [
      { href: "/opportunities", label: "Find work", description: "Browse open, paid opportunities.", primary: true },
      { href: "/passport", label: "Your Passport", description: "Manage your photo, links, evidence, and portfolio." },
      { href: "/applications", label: "Applications", description: "Track the applications you have submitted." },
      { href: "/opportunities/invited", label: "Invitations", description: "Employers who've asked you specifically to apply." },
      { href: "/offers", label: "Offers", description: "Review and respond to offers." },
      { href: "/contracts", label: "Contracts", description: "Deliver work, message clients, and view payments." },
      { href: "/notifications", label: "Notifications", description: "Updates on your offers, payments, and messages." },
      { href: "/opportunities/saved", label: "Saved", description: "Return to opportunities saved for later." },
      { href: "/onboarding", label: "Onboarding", description: "Complete or review your verification steps." },
      { href: "/trust-safety", label: "Trust & Safety", description: "Free orientation on staying safe on AdorWorks." },
      { href: "/assistance/request", label: "Request help", description: "Ask for assisted onboarding support." },
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
      { href: "/organisation/team", label: "Team", description: "Review organisation membership and access." },
      { href: "/contracts", label: "Contracts", description: "Manage active and completed work." },
      { href: "/notifications", label: "Notifications", description: "Updates on applicants, payments, and messages." },
      { href: "/assistance/request", label: "Request help", description: "Ask AdorWorks for support." },
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
    description: "The existing staff console remains the operational workspace during this staged enhancement.",
    actions: [],
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
