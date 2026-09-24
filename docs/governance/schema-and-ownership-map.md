# Schema and ownership map (S03-01, S14-01)

A reference for what tables exist, what each one is for, and who is
allowed to write to it — not a full column-by-column reference (the
migration files in `backend/supabase/migrations/` are the source of
truth for exact columns/constraints). 58 tables exist today, defined
across 88 migration files, applied in order.

**How to read "who writes"**: most tables are protected by Postgres Row
Level Security (RLS) — a person can only read/write rows RLS says they're
allowed to, even though every part of this project connects to the same
database. "Self" means a signed-in user can write their own rows directly.
"Staff-only" means only AdorWorks staff (via the staff console, itself
backed by `backend/api`'s service-role client, which bypasses RLS
entirely) can write. "System" means only server-side application code
writes it — no RLS policy allows a direct client write at all.

## Identity and trust

| Table | What it holds | Who writes |
|---|---|---|
| `profiles` | One row per person (base identity, name, phone/email verification flags) | Self (own row), Staff |
| `honorifics` | Static lookup list (Mr/Mrs/Dr/...) | System (seeded once, effectively read-only) |
| `role_change_requests` | A person asking to add/change a role (e.g. become an employer) | Self (create), Staff (decide) |
| `talent_profiles` | A talent's public profile: skills, category, verification tier | Self, Staff |
| `talent_evidence` | Uploaded verification documents | Self (upload), Staff (review) |
| `talent_introduction_videos` | Self-recorded intro video + staff review status | Self (upload), Staff (review) |
| `talent_portfolio_items` | Portfolio pieces on a talent profile | Self |
| `verification_checks` | Per-dimension staff verification decision on an organisation (registration, representative) | Staff-only |
| `verification_events` | Audit trail of every talent verification-tier change | System (written only by the `/talent/:id/verify` endpoint, alongside `audit_events`) |
| `onboarding_agents` | Staff/partner-hub agents authorized to do assisted onboarding on someone else's behalf | Staff-only |
| `partner_hubs` | Physical partner locations assisted onboarding happens through | Staff-only |
| `assistance_requests` | A request for in-person/assisted onboarding help | Self or unauthenticated intake, Staff (assign/close) |
| `assistance_sessions` | An active assisted-onboarding session, with the onboarded person's consent recorded | System (created once consent is recorded), Staff |
| `assisted_field_changes` | Field-level audit of what a staff member changed on someone else's behalf during an assisted session | System |
| `intake_submissions` | Raw public-facing "get started" form submissions before an account exists | Public (unauthenticated insert), Staff |

## Organisations and opportunities

| Table | What it holds | Who writes |
|---|---|---|
| `organisations` | An employer organisation, including its overall `verification_status` | Self (representative), Staff |
| `organisation_members` | Team members of an organisation and their role (owner/admin/viewer) | Self (org owner/admin), Staff |
| `opportunities` | A job/gig posting | Self (org owner/admin), Staff (moderation: publish/reject/pause) |
| `screening_questions` | Custom screening questions on an opportunity | Self (org owner/admin) |
| `service_packages` | A talent's offered service package (for `/services`) | Self (talent) |
| `talent_services` | (Superseded naming for the above in early migrations — see `service_packages`.) | Self |
| `saved_opportunities` / `dismissed_opportunities` | A talent's saved/hidden opportunities | Self |
| `saved_services` / `dismissed_services` | A signed-in person's saved/hidden service listings | Self |
| `organisation_team_invitations` (0075) | A pending invite for someone to join an org's team, with a token + expiry | Self (org admin, create), Public via token (accept — the token itself is the auth, see `platform/src/app/organisation/invite/[token]`), Staff |
| `opportunity_attachments` (0077) | Files attached to an opportunity posting (briefs, specs) | Self (org owner/admin) |
| `service_requests` (0079) | An employer requesting a specific published talent service — the counterpart flow to `invitations`, direction reversed | Self (org, create), Self (talent, respond) |

## Applications, offers and contracts

| Table | What it holds | Who writes |
|---|---|---|
| `applications` | A talent's application to an opportunity | Self (talent, create), Self (org, stage changes), Staff |
| `application_notes` | Private staff/employer notes on an application | Self (org), Staff |
| `application_scorecards` | Structured interview scoring | Self (org) |
| `screening_answers` | A talent's answers to an opportunity's screening questions | Self (talent) |
| `application_drafts` (0078) | A talent's in-progress, not-yet-submitted application | Self (talent) |
| `invitations` | An employer directly inviting a talent to apply | Self (org) |
| `offers` | Formal terms proposed before a contract exists | Self (org, create), Self (talent, respond) |
| `contracts` | An active/completed engagement between a talent and an organisation | System (created only when an offer is accepted — `offers.ts`), Self (participants, status changes like cancel — RLS blocks direct `UPDATE`, so this goes through the admin client from a participant-authenticated Server Action) |
| `milestones` | Payment milestones on a contract | System (created with the contract), Self (talent submits, org approves — same admin-client pattern) |
| `deliverables` | Uploaded work product against a milestone | Self (talent, upload), Self (org, approve/reject) |
| `timesheets` | Logged hours against a contract | Self (talent), Self (org, approve) |
| `engagements` / `engagement_events` | Structured engagement/assignment tracking outside the contract flow | Staff-only |
| `work_history` | A talent's durable "Passport" record of completed engagements | System (written only when a contract completes) |

## Payments and finance

| Table | What it holds | Who writes |
|---|---|---|
| `payment_intentions` | A payment attempt, pre-settlement | System (`payMilestone`, via admin client) |
| `payment_events` | A settled (simulated, currently) payment, with `is_simulated` always true today | System |
| `finance_records` | Manually-tracked invoices/payments staff or the system record | System (invoice on milestone approval), Staff (manual entries) |

## Messaging and disputes

| Table | What it holds | Who writes |
|---|---|---|
| `conversations` | A message thread scoped to one contract or one application | System (created on first message) |
| `conversation_members` | Who's in a conversation | System |
| `messages` | Individual messages, optionally with a file attachment | Self (participant) |
| `disputes` | A raised dispute on a contract | Self (participant, raise), Staff (resolve) |
| `reviews` | Post-contract reviews between talent and employer | Self (participant) |
| `reports` | Content moderation reports (e.g. flagging a listing), now including a distinct `safeguarding` reason restricted to admin-only visibility (0084) | Self (reporter), Staff (decide) |

## Trust, notifications and audit

| Table | What it holds | Who writes |
|---|---|---|
| `notifications` | In-app notifications for a user, with `dedupe_key` (0085) to block duplicate sends and an opt-out flag on `profiles.email_notifications_enabled` (0086) governing the email channel | System |
| `phone_verification_codes` | SMS OTP codes for phone verification | System |
| `audit_events` | The general audit trail (0035) — every high-stakes action funnels here via `logAuditEvent()` | System-only (no RLS insert policy for regular users, by design) |
| `auth_rate_limit_attempts` (0063) | Sliding-window rate-limit records for login/signup/password-reset attempts, keyed by email or IP | System-only |
| `risk_flags` (0083) | A staff-raised "something looks off" signal on an organisation/opportunity/talent profile/service/file, distinct from the reactive user-submitted `reports` table | Staff-only |

## Known RLS drift (S14-03 audit, 2026-09-19)

A full table-by-table RLS read (86 migrations at the time) found the
schema is sound overall — no cross-organisation leakage, no
un-scoped `using (true)` on tenant/financial data, both historical
recursion bugs (0017, 0060) confirmed not reintroduced. Two real,
fixed-since findings and two accepted/documented ones are worth
tracking here so they don't silently drift further:

- **Fixed this session**: `risk_flags` allowed staff to INSERT/UPDATE/
  DELETE directly via RLS instead of only through the audited
  backend/api route — closed in `0088_risk_flags_tamper_resistance.sql`.
- **Open, low severity**: `talent_profiles_select` (last touched 0070)
  never got the `is_org_write_member()` upgrade its sibling policies
  (`applications_select`, `opportunities_insert/update`) received in
  0039 — an invited (non-representative) org teammate who legitimately
  shortlists a self-service applicant may not be able to read that
  talent's profile. A functional gap, not a leak; needs a live test to
  confirm whether the app already works around it before deciding if
  it's worth a migration.
- **Open, low severity**: `notifications_update_owner` (0058) has no
  column-level guard restricting a user's own UPDATE to `read_at` —
  they could technically rewrite their own notification's title/body,
  undermining but not breaking the "notification is a system record"
  invariant. Self-scoped only, no cross-tenant exposure.
- **Already accepted, documented in its own migration**: suspended
  accounts retain RLS-governed read/write access until their session
  token expires or `backend/api`'s password-rotation-on-suspend takes
  effect (`0081_account_suspension.sql`'s own comment explains why RLS
  wasn't retrofitted schema-wide for this).

## Where this can get stale

This map reflects the schema as of migration `0088` (2026-09-19). It had
drifted to `0061` before this update — 25 migrations' worth of new
tables and column additions were missing. Whenever a new migration
adds/removes/renames a table, update this doc as part of that same
change — it isn't derived automatically, so it will drift again if it's
treated as a one-time snapshot rather than a living doc.
