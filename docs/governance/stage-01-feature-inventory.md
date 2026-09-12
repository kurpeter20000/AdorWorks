# Stage 1 feature inventory (S01-11)

An honest first-pass inventory of what exists today, organized by the tracker's own stages. This is **not** a verified audit — "Exists" means I found real, working code for it, not that it has passed the specific tests and checks each later stage requires. Stages 2–16 are where that verification actually happens.

Legend: 🟢 Exists and looks substantially complete · 🟡 Partially built · 🔴 Not started · ⚪ Needs a person, not code (legal, pilot recruitment, etc.)

## Stage 2 — Environments, CI and test data

- 🟡 CI runs lint, unit tests and a production build automatically on every push, for both the Next.js app and the backend API (`.github/workflows/ci.yml`).
- 🔴 No separate staging environment. No seed data. No disposable end-to-end test database. No documented local setup walkthrough beyond scattered README notes.
- 🟡 Some branch protection exists on `main` (confirmed live: a push was accepted only as a logged "bypass" of a protected-ref rule) — but its actual requirements (reviews, checks, who can bypass) aren't confirmed, see S01-07.

## Stage 3 — Data, backups and observability

- 🟢 Database schema is extensively documented across 60 numbered, ordered migrations with consistent rollback comments on the more recent ones.
- 🟡 Audit logging exists (`audit_events` table) and covers many actions (role changes, application stage changes, people/organisation actions) — I personally closed several real gaps here recently (dispute resolution/escalation, refund issuance, finance record changes, opportunity moderation, onboarding-agent role grants), but coverage is not yet complete or independently verified against this tracker's specific bar.
- 🔴 No error monitoring, no uptime monitoring, no structured logging with correlation IDs — this was already flagged as an open gap in this project's own prior internal security review (`docs/stage-10-security-accessibility-performance-and-controlled-release.md`).
- 🔴 No confirmed automated backup configuration or restore rehearsal (Supabase likely has some default backup behavior, but nothing has been verified or rehearsed).
- 🔴 No documented data retention/deletion policy.

## Stage 4 — Authentication, permissions and privacy

- 🟢 Talent/employer registration, login, logout, password reset all exist and work (self-service, via Supabase Auth).
- 🟢 Role-based Row Level Security is extensive — every sensitive table (profiles, organisations, opportunities, applications, contracts, disputes, finance records, reviews, reports, private evidence) has real database-level policies, not just interface-level hiding.
- 🟡 A 30-minute idle-session timeout exists. No confirmed MFA for staff accounts. No confirmed rate limiting on login/recovery/registration.
- 🔴 No data export feature. No account deletion feature. No recorded Terms/Privacy acceptance with version tracking.
- 🔴 No automated negative-path tests specifically proving "user A cannot access user B's data" — the RLS policies exist and I reviewed them manually, but this tracker wants actual automated tests for it.

## Stage 5 — Talent dashboard and passport

- 🟢 Full Passport flow exists: personal details, skills, education, experience, CV, portfolio, availability, verification status display.
- 🟢 Recently redesigned dashboard with a real sidebar, mode switcher, and clearer visual hierarchy.
- 🟡 Mobile/low-bandwidth testing has been done informally (screenshots, manual checks) during recent redesign work, not as a formal test suite.

## Stage 6 — Employer and organisation dashboard

- 🟢 Organisation setup, verification submission, team invitations and roles all exist.
- 🟢 Employer dashboard was recently redesigned with real stat tiles sourced from live data (open opportunities, applicants awaiting, active contracts, milestones to pay).
- 🟡 Candidate search, shortlisting and comparison exist; not verified against this tracker's specific cross-organisation-isolation test bar.

## Stage 7 — Opportunities and job discovery

- 🟢 Full opportunity lifecycle: draft → pending review → staff approve/reject/request changes/pause → open → filled/closed/expired. Both an older staff-console path (via the backend API) and a newer in-app staff review screen (`platform/operations`) exist for approve/reject/request-changes — not yet reconciled into one path, see the open question I flagged earlier in this conversation.
- 🟢 Search, filters (category, engagement type, work mode, and a newer coarse "Talent Mode" work-type filter), saved/dismissed opportunities, invitations.
- 🔴 No confirmed job-notice legal/serial-number workflow (this needs S07-03/S13-03's legal input first).

## Stage 8 — Applications and hiring workflow

- 🟢 Application submission, duplicate/late prevention, withdrawal, staff/employer review, stage transitions, shortlisting, scorecards, interviews, offers all exist.

## Stage 9 — Services, offers and contracts

- 🟢 Service profiles, contracts, milestones, deliverables, timesheets, disputes (including a refund mechanism) all exist.
- 🟢 Payments are genuinely simulated throughout — `is_simulated` never becomes `false` anywhere in the code, confirmed directly.

## Stage 10 — Staff operations, trust and support

- 🟢 Staff console (`staff/`) covers verification, moderation, shortlisting, finance records, disputes.
- 🟡 Reports/moderation exist; safeguarding/PSEA-specific escalation handling not confirmed as a distinct feature.
- 🟡 Reasons are required for some sensitive actions (e.g. dispute resolution, opportunity rejection) but not confirmed as universally enforced.

## Stage 11 — Notifications and communication

- 🟢 In-app notification centre exists and is wired to several real events.
- 🔴 No confirmed email template system or SMTP delivery — this project's own backend documentation flags Supabase's default mailer as unreliable for real use and recommends configuring real SMTP (Brevo), but I have no evidence this was actually done.

## Stage 12 — Accessibility, responsive design and performance

- 🟡 Real, recent work: WCAG contrast fixes (documented in the prior internal security review), keyboard focus rings, mobile-responsive redesigns of login/dashboard. Not yet a full, systematic pass against WCAG 2.2 AA or a defined performance budget.

## Stages 13–16 — Legal, security review, release candidate, pilot

- ⚪ Not started — these correctly require people (legal counsel, an independent security reviewer, the founder, a pilot team) that this tracker itself says I cannot substitute for.

## Marketing site & deployment (not a separate tracker stage, but real recent work)

- 🟢 Public marketing site migrated from Netlify (which got paused for hitting its usage limits) to Cloudflare Pages, with a real build step that keeps `backend/`, `platform/`, `docs/`, `.github/` from ever being publicly servable.
- 🔴 4 open Dependabot vulnerabilities on `main` (2 high, 2 moderate) — not yet triaged.
