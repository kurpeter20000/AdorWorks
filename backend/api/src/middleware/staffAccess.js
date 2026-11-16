/**
 * Phase B2 (agreed with the owner on 2026-11-16): each staff role works
 * only its own queues; admins can do everything. The platform app keeps
 * the page-level copy of this map in platform/src/lib/domain/staffAccess.ts
 * — change both together.
 *
 *   reviewer       opportunities, services, intake
 *   verifier       talent and organisation verification
 *   trust_safety   reports, disputes, support
 *   finance        payouts, invoices, contracts and refunds, settings
 *   field_support  assisted onboarding, support
 *   matcher        shortlists and engagements
 *
 * `read` roles may use GET routes (a matcher searching talent to build a
 * shortlist, say); `write` roles may also change things. Admin is always
 * allowed. Routes that already demand finance or admin (finance, refunds,
 * people) keep those stricter checks on top of this.
 */
export const STAFF_ROLES = new Set(["reviewer", "verifier", "trust_safety", "finance", "field_support", "matcher", "admin"]);

export const STAFF_API_ACCESS = {
  intake: { read: [], write: ["reviewer"] },
  talent: { read: ["matcher", "trust_safety"], write: ["verifier"] },
  organisations: { read: ["reviewer", "matcher", "trust_safety"], write: ["verifier"] },
  opportunities: { read: ["matcher", "trust_safety"], write: ["reviewer"] },
  talentServices: { read: ["trust_safety"], write: ["reviewer"] },
  reports: { read: [], write: ["trust_safety"] },
  // Anyone on staff can raise a risk flag on what they're looking at.
  riskFlags: { read: [], write: ["reviewer", "verifier", "trust_safety", "finance", "field_support", "matcher"] },
  applications: { read: ["reviewer"], write: ["matcher"] },
  engagements: { read: ["finance", "trust_safety"], write: ["matcher"] },
  contracts: { read: ["finance", "trust_safety", "matcher"], write: [] },
  disputes: { read: [], write: ["trust_safety", "finance"] },
  reviews: { read: ["reviewer", "matcher", "trust_safety"], write: [] },
  assistedOnboarding: { read: [], write: ["field_support"] },
};

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Express middleware: run after requireAuth + requireStaff. */
export function requireStaffArea(area) {
  const access = STAFF_API_ACCESS[area];
  if (!access) throw new Error(`Unknown staff area: ${area}`);
  const readers = new Set(["admin", ...access.read, ...access.write]);
  const writers = new Set(["admin", ...access.write]);
  return function staffAreaGuard(req, res, next) {
    const allowed = READ_METHODS.has(req.method) ? readers : writers;
    if (!req.user || !allowed.has(req.user.role)) {
      return res.status(403).json({
        error: "Your staff role doesn't cover this. Ask an admin if you need access.",
        code: "staff_area_forbidden",
      });
    }
    next();
  };
}
