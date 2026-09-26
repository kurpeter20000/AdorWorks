# Release candidate notes and known limitations (S15-12)

Draft for the founder's review — written for internal/pilot-team use
first, not yet vetted for any external/public release communication.
Compiled from what's actually built and verified across this project's
stages, cross-checked against `stage-15-unresolved-issues.md` (S15-11)
for the limitations half rather than restated from memory.

## What this release delivers

**Accounts and identity**
Self-service signup for talent and employers, with email confirmation.
Talent and employer/organisation account types, each with their own
dashboard. Staff accounts (reviewer/matcher/finance/admin) require
TOTP multi-factor authentication, enforced both in the platform app
and in `backend/api` directly. Password reset via email. Rate limiting
on login, signup, password reset, MFA challenges, reports, invitations,
and file uploads.

**Talent side**
A "Passport" profile (photo, links, portfolio, work experience,
education, CV, an optional introduction video) with staff-reviewed
verification evidence. Browsing and applying to paid opportunities,
including invited and saved opportunities. Application tracking,
offers, and contract delivery with milestone-based payment (currently
simulated, not real money — see limitations). Direct messaging with
clients on an active contract. A trust-tier badge visible on the
public profile.

**Employer side**
An organisation workspace with team membership (admin/member/viewer
roles) and invitation-based team growth. Posting paid opportunities
(with a staff review queue) or quick project briefs. A self-service
candidate search and shortlisting path for organisations that opt in,
alongside staff-assisted matching for those that don't. Reviewing
applicants, sending offers, and managing contract delivery/payment
through the same milestone flow talent see. A defined services catalog
talent can list and employers can browse/book directly.

**Staff operations**
An in-app operations queue for reviewing pending opportunities
(approve/reject/request changes), alongside the existing staff
console for organisation verification, disputes, finance oversight,
and people management. Reports and risk flags with severity, staff
assignment, and mandatory resolution reasons. Account suspension/
reinstatement. A comprehensive audit trail (`audit_events`) covering
every sensitive staff and system action.

**Trust and safety**
Row-Level Security enforced at the database layer for every
multi-tenant table, independently verified table-by-table (S14-03).
A safeguarding report category, routed admin-only. Staff MFA required
for all elevated roles. A maker-checker approval flow for promoting
anyone to admin or finance specifically — no single admin can
unilaterally grant that access to themselves or anyone else.

**Notifications**
In-app notifications with duplicate-prevention and a user-controlled
email on/off preference, paired email delivery for every major event
category (offers, applications, milestones, disputes, messages,
invitations, verification decisions, security notices), and a
signed, session-free unsubscribe link.

**Accessibility and performance**
WCAG AA contrast fixes across the app, keyboard navigation and focus
states, screen-reader-announced form errors, and an automated
axe-core regression suite. A real, enforced Lighthouse CI performance
budget (mobile-throttled, matching the pilot's expected connection
profile) on the three pages testable without a login flow.

**Reliability**
A daily automated production database backup with restore-rehearsal
evidence (pending the current secret fix — see limitations). Every
database migration verified to reach the release schema from a
genuinely empty database with zero manual repair, checked
automatically in CI.

## Known limitations at this release

Full detail and reasoning for each of these lives in
`stage-15-unresolved-issues.md` — this is the release-facing summary.

- **Payments are simulated, not real money.** The milestone/escrow
  flow is fully built, but no real payment processor is wired in yet
  (a deliberate, feature-flagged state — `ADORWORKS_FF_REAL_PAYMENTS`).
- **English only.** The pilot geography (South Sudan) and product
  decision call for English, Swahili, and Arabic support; the app is
  currently English-only everywhere.
- **No malware/virus scanning on uploaded files.** Accepted for pilot
  scale.
- **No real custom domain yet** — the platform runs on
  `ador-works.vercel.app`, the marketing site on `adorworks.pages.dev`.
- **Legal review is incomplete.** Ten Stage 13 items require legal
  counsel this project doesn't have yet; drafts exist for the
  preparable ones but nothing is finalized or legally reviewed.
- **Security review is technically complete but not independently
  certified** — the same party that did the fixing also verified them;
  a genuinely independent reviewer hasn't looked at this yet.
- **A small number of accepted-risk dependency vulnerabilities**
  remain in a CI-only dev dependency (`@lhci/cli`'s `extract-zip`
  chain) — no patched version exists upstream, and the actual exposure
  is effectively nil (it only unpacks trusted Chrome binaries inside a
  CI job). Documented in the decision log.
- **Two staff-review paths coexist and haven't been reconciled** — the
  original `backend/api` staff console and the newer in-app
  `/operations` queue both work; which one becomes the long-term
  primary is an open product decision.
- **No SLA targets are set** for staff response times (reports,
  verification, disputes) — a policy decision, not yet made.
- **No anomaly detection on staff activity** and **no
  application-level DDoS protection** beyond the hosting platforms'
  own baseline — both accepted as reasonable for pilot scale, real
  gaps to revisit if the team or traffic grows.
- **One known UI bug**: a closed opportunity can still briefly appear
  in search results after closing and reloading the page (a stale-
  cache/revalidation gap, not a data-integrity issue).

## Not yet run as of this draft

- Founder and pilot-team user acceptance testing (S15-10).
- The full automated end-to-end regression suite against the current
  build (S15-01/02/03/05/06/07) — blocked on test-project API
  credentials as of this writing.
- The final rollback test (S15-15) — depends on the production backup
  being restored to working order first (currently broken, in
  progress).
