# Stage 5 — Applications, Pipeline and Structured Hiring

Status: **implemented** (commit `e3fc2a9`). Applications/offers/contracts
already worked before this stage (built pre-dating the staged governance
process); this closes the specific gaps found auditing against the
playbook's Stage 5 checklist, plus one approved scope decision (shared
notes only, not full role differentiation).

## What this delivered

- **Withdrawal and reapply** (`0049`) — a talent can withdraw their own
  application (submitted/shortlisted/interviewing → withdrawn) and
  reapply (withdrawn → submitted, only while the opportunity is still
  open). `withdrawn` previously existed only as an enum value with no
  reachable action. A new `guard_applications_update` trigger enforces
  exactly these two transitions for a non-staff user, alongside the
  existing employer self-service ones (0030/0046), and blocks a talent
  from changing any column but `stage` on their own row.
- **Employer invitations** (`0050`) — real outreach the talent can
  decline, distinct from Stage 4's `addCandidateToShortlist` (which
  silently enrolls someone with no consent step). Accepting creates the
  actual `applications` row; declining just closes out the invitation.
  Closes Stage 4's explicitly-deferred "invited opportunities" feed
  (`/opportunities/invited`).
- **Structured scorecards** (`0051`) — four fixed criteria (skill fit,
  communication, portfolio quality, reliability) rather than
  employer-defined ones, so scores stay comparable across candidates
  without needing a criteria-management UI. Any number of an org's team
  members can score independently; a candidate comparison page averages
  them side by side.
- **Interview scheduling/notes** (`0051`) — single round, directly on
  `applications` (no separate `interviews` table — no multi-round need
  identified yet).
- **Shared candidate notes** (`0052`) — per the approved scope decision:
  any org write-member can see and add notes on their org's applications.
  Does **not** differentiate recruiter/hiring_manager/finance from each
  other — that stays the same documented limitation as Stage 2/`0039`,
  not reopened here.
- **Status truthfulness** (`0053`) — a single trigger on `opportunities`
  closes out stale applications (→ `rejected`, with a neutral reason)
  whenever an opportunity becomes closed/cancelled/expired/filled,
  regardless of which of the three existing paths caused it (self-service
  close, the expiry cron, or staff's status editor). Before this, a
  talent's `/applications` page could show "Submitted" for a role that
  had been dead for weeks. Also fixed `declineOffer`, found during this
  work to only ever update the offer itself — the linked application sat
  at `offered` forever; it now cascades to `withdrawn`.
- **Anti-spam** — a soft cap of 15 applications per rolling 24 hours,
  without a pay-to-apply model.
- **Audit logging wired** — `DOMAIN_EVENTS` existed since Stage 1 but
  nothing had ever called `logAuditEvent` for the applications/offers/
  contracts pipeline. Now wired on the platform side (the existing
  helper) and from the backend/api staff PATCH route (a direct
  `audit_events` insert, since that helper is TS-only).

## Deliberately not built

- Full recruiter/hiring_manager/finance permission differentiation on
  applications/offers/contracts — per the approved decision for this
  pass (shared notes only). Still the same known, documented limitation
  from Stage 2/`0039`.
- Multi-round interview scheduling — single round covers what's needed
  today; revisit if a real multi-round need shows up.
- New Playwright e2e coverage for the new triggers/transitions — Stage 3
  and 4 already added specs that still need a dedicated test Supabase
  project to run; adding more untested specs on top has limited value
  until that's set up. The new guard trigger and cascade logic were
  verified live via scratch scripts against production instead (same
  practice as every migration in this project).

## Migrations added

Run in order, after `0048_saved_and_dismissed_listings.sql`:

- `0049_application_withdrawal.sql`
- `0050_employer_invitations.sql`
- `0051_application_scorecards_and_interviews.sql`
- `0052_application_notes.sql`
- `0053_application_status_truthfulness.sql`

All additive; each documents its own rollback in-file.

## Tests

Platform: 52/52. Backend: 24/24. Full production build passes with every
new route (`/opportunities/invited`, `/organisation/opportunities/[id]/
invite`, `/organisation/opportunities/[id]/compare`).

## Known gap

No independent gap-check pass has been run yet against this doc (the
pattern used for Stages 2-4, which found real issues each time) — this
reflects the checklist read directly from the playbook during planning,
not a second audit after implementation.
