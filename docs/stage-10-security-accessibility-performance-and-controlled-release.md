# Stage 10 — Security, Accessibility, Performance and Controlled Release

Status: **audit complete, verified defects fixed, awaiting explicit
product-owner GO/NO-GO decision.** Per this stage's own instructions,
Claude Code does not deploy or merge to production without that explicit
approval — this document is the evidence package to decide against, not
a deployment that already happened.

Four parallel, independent audits were run against the fully-integrated
Stage 0-9 platform (not per-feature reviews like earlier stages — this
was a final, cross-cutting pass looking specifically for defects that
only show up once everything is combined): security/tenant-isolation,
migration integrity and rollback readiness, accessibility/performance,
and privacy/retention/consent/audit/monitoring. Findings and fixes below.

## Release candidate

- **Tag:** `v1.0.0-rc1`, commit `449d75c`, pushed to `origin`.
- This repo has **no separate staging environment** — `main` auto-deploys
  directly to production on every push, across all three platforms
  (Netlify for the public site + staff console, Vercel for `platform/`,
  Render for `backend/api`). "Release candidate" here means: the current
  state of `main`, tagged for reference and rollback, not a build sitting
  in a staging slot waiting for promotion. This is a real structural
  constraint on what "controlled release" can mean in this environment —
  see Rollout sequence below for how to work within it.

## 1. Security, tenant and object-access review

**One confirmed, real bug — fixed.** A read-only `'viewer'` organisation
member could approve or reject a talent's submitted timesheet via
`reviewTimesheet()` — the permission check only verified organisation
*membership* existed, never the member's *role*, even though `'viewer'`
was introduced (migration `0039`) specifically to be read-only. RLS
provided no backstop here (by design — `timesheets` review intentionally
has no direct-update RLS path, so this TypeScript check was the entire
enforcement boundary). Fixed in `platform/src/lib/domain/
timesheetPermissions.ts` to require a non-`'viewer'` role; added a
regression test.

**Everything else checked out clean**, including two areas expected to
turn up problems on close inspection:
- Cross-tenant isolation across contracts, milestones, payment_events,
  applications, offers, disputes/finance_records, conversations/messages
  — every RLS policy traced to its latest (superseding) version across
  all 59 migrations, no cross-org or cross-talent leak found.
- The entire `backend/api` staff trust boundary — all 14 route files
  confirmed to apply `requireStaff`/`requireAdmin`/`requireFinanceStaff`
  at the router level, all 14 confirmed mounted in `server.js`.
- 10 spot-checked Server Actions using the admin client (which bypasses
  RLS entirely) — every one has an explicit, correctly-scoped ownership
  check before any privileged write.

**One minor, non-blocking finding, not fixed:** `conversation_members`'s
insert policy never checks that the row's `user_id` equals the caller's
own — a legitimate contract/application participant could add an
arbitrary third party to their own conversation, exposing *their own*
data to someone else. Impact is self-inflicted disclosure, not an
attacker reaching a stranger's data. Recorded as optional hardening, not
release-blocking.

**Already-known, not re-flagged:** `offers_insert`/`offers_update` RLS
still allows a `'viewer'` to create/edit a *draft* offer directly (only
*sending* one is gated, via the admin-client action's representative-only
check) — and several actions (`sendOffer`, `payMilestone`, `sendMessage`,
`raiseDispute`, `cancelContract`) gate on `organisations.representative_id`
rather than any write-capable org role, meaning an invited admin
teammate (not the original founder) can't perform these actions either.
Both are pre-existing, explicitly documented product decisions from
Stage 8's own doc, not regressions — under-permissioning, not a security
hole.

## 2. Migration, backfill, data-integrity and rollback rehearsal

**Rehearsal reality check (read first):** this repo has no Supabase CLI
project, no `docker-compose`, no local Postgres tooling of any kind —
confirmed by `backend/supabase/README.md`'s own deploy instructions
("paste and run every file... in the Supabase dashboard SQL Editor") and
a repo-wide search turning up nothing else. **"Rollback rehearsal" in
this environment can only mean verified by careful code reading, not
tested against a disposable database.** Standing up that tooling (either
`supabase init` + `supabase start`, or a bare local Postgres) is real
infrastructure work not attempted in this pass — recorded as a gap, not
silently assumed away.

**Sequence integrity:** all 59 migrations (`0001`-`0059`) are
contiguous, no gaps or duplicates, no forward references to
not-yet-created schema. Idempotency spot-checked across 10 migrations
spanning the full range — all safely re-runnable.

**Rollback documentation — fixed for the active/recent range, gap
recorded for the rest.** Rollback comments were prose/pseudo-SQL, not
literal executable statements (e.g. "drop columns X, Y, Z from table"
isn't valid syntax) — rewritten as real SQL for `0057`, `0058`, `0059`,
with explicit warnings added where a "safe" rollback isn't actually
routine:
- `0057`: dropping the idempotency index removes `payMilestone()`'s only
  double-charge defense, with no error to signal it's gone.
- `0058`: dropping the notifications table is irrecoverable; disabling
  the feature without erasing history is the safer partial rollback.
- `0059`: dropping the uniqueness indexes silently re-opens the exact
  conversation-forking race the migration fixed, since app code now
  depends on them to catch and recover from that race.
- `0040` had no rollback comment at all (an isolated gap in an otherwise
  consistent run from `0031` onward) — added retroactively.

**Not fixed, recorded as a known gap:** migrations `0001`-`0030` (roughly
half the schema's history, including the foundational schema itself)
have **no rollback documentation whatsoever** — the convention was
adopted partway through the project and never backfilled. Confidently
reconstructing correct rollback SQL for 30 foundational migrations
without a disposable database to verify against would be guessing, not
documenting, so this was not attempted blind. In practice, a rollback
need almost always concerns *recent* migrations (which now have real
rollback SQL), not month-old foundational ones — but this is a real gap,
not a hidden one.

**Data-mutating migrations:** all backfills (`0032`, `0038`, `0045`,
`0053`, `0054`) reproduce current computed state or only touch rows in a
specific stale state — low risk. `0057`'s backfill
(`net_amount = amount where net_amount is null`) is safe under its
stated assumption that every existing row predates fee calculation; if
that assumption were ever wrong for one row, it would silently mislabel
that row with no way to detect it later. `0059`'s conversation dedup is
irreversible by construction — no record survives of which messages
originally belonged to which forked conversation.

## 3. End-to-end tests across all three dashboards and public routes

**Real e2e infrastructure exists, but cannot be executed in this
environment right now.** `platform/e2e/` has 9 well-targeted Playwright
tests (`auth.spec.ts`, `authorization.spec.ts`,
`opportunity-lifecycle.spec.ts`) — entirely authorization/security-
boundary tests (talent can't view another talent's contract, non-staff
can't skip review, org isolation holds), not general happy-path
functional coverage. The suite has real, deliberate safety rails: it
refuses to run without a dedicated test Supabase project (verified via
`E2E_EXPECTED_SUPABASE_PROJECT_REF` matching), and **no such project is
configured** (`platform/.env.e2e.local` does not exist). This is
correct, safe behavior — the alternative would be running mutation
tests against the real production database, which was correctly never
attempted.

**What was actually verified instead:**
- Unit/integration suites: 54/54 platform tests, 24/24 backend tests,
  all passing on the current `main`.
- Full production build succeeds (`next build`, zero errors).
- Public routes (Stage 9): live-verified via direct HTTP checks against
  `adorworks.netlify.app` — canonical/OG tags, the `backend/`/`platform/`/
  `docs/` exposure fix, `/staff/*` noindex header, the new pages, and the
  configured GA4 ID all confirmed live.
- The three dashboards (Talent/Employer/Operations) were not walked
  through live in a browser — every individual feature within them was
  gap-checked at its own stage (Stages 3-8), and this stage's holistic
  security pass re-verified the access boundaries between them, but a
  fresh, whole-dashboard live walkthrough was not performed here.

**Recommendation:** set up a dedicated test Supabase project (cheap, free
tier) and populate `.env.e2e.local` before treating e2e coverage as
"verified" rather than "exists but unexercised." Not done in this pass —
it requires a decision (and a few minutes of Supabase console work) only
the product owner can make quickly.

## 4. Accessibility and browser/viewport regression

No live browser was available for this audit — everything below is a
code-level read, explicitly not a Lighthouse/axe run.

**Fixed:** `--color-coral` as text is ≈2.82:1 against white — fails even
WCAG AA's 3:1 floor for large text — and it's the app's error/danger text
color, used 131 times across 59 files (via Tailwind's `text-coral`
class). Every current usage is on a light background (verified no
dark-background exception exists). Added `--color-coral-ink` (≈5.18:1,
the same fix already applied to teal previously) and renamed every
`text-coral` to `text-coral-ink`. `bg-coral` (badges, focus rings) is
unaffected.

**Not fixed, recorded as a known gap:** 11 files have form inputs with no
`<label>`/`aria-label` at all (e.g. both date inputs on the timesheets
section are indistinguishable to a screen reader; several file-upload
inputs are unlabeled). Error/status text outside the 6 files that use
the existing `StatePanel` component (which correctly sets
`role="status"`/`role="alert"`) has no role and is never `aria-live` —
zero `aria-live` occurrences exist anywhere in `platform/src`. Labeling
and status-announcement are inconsistent, not absent — real, systemic,
and larger than a single-session fix without live-browser verification
to confirm each change doesn't regress something else. Recorded as a
conditional-release item, not attempted blind.

## 5. Performance and low-data mobile

**Fixed:** the contract detail page's message thread had no `.limit()`
at all — a long-running contract's entire message history (with
attachments) re-downloaded on every visit, both a server-load and a
low-data-mobile cost (an explicit, repeated product principle for this
market). Capped to the most recent 200 messages.

**Two lower-priority instances left unfixed, on purpose:** the same
unbounded pattern exists on `/applications` and the employer opportunity
page, but there it aggregates messages across *multiple* conversations
(one per application) in a single query. A blind global cap-and-reverse
there risks hiding older messages for a specific busy application while
showing others — a subtler correctness regression not worth rushing
without a way to verify it live. Recorded as a follow-up.

**Everything else checked out clean:** no N+1 query patterns found
anywhere in `platform/src/app`; every list-fetch is properly batched
with `.in()`. `next/image` is used consistently for every user-uploaded
image with responsive `sizes`; zero plain `<img>` tags exist. The
introduction video uses `preload="metadata"` + a poster image, avoiding
any download before a user hits play. No polling exists anywhere. The
runtime dependency list (`next`, `react`, `@supabase/*`, `zod`) has no
heavy chart/animation/date library to worry about bundle size on.

## 6. Privacy, retention, consent, audit, monitoring and alert verification

This section is almost entirely **recorded gaps, not fixes** — each of
these needs a genuine product/infrastructure decision (a retention
period, a monitoring vendor, a consent-copy sign-off) that isn't
Claude Code's to make unilaterally, and building any of them
speculatively would risk getting the actual policy wrong.

- **Audit logging: partial, not comprehensive.** Real infrastructure
  exists (`audit_events` table, staff-only RLS, a genuine staff-console
  viewer at `people.html`) — but of the 22 named `DOMAIN_EVENTS`, only
  offer/application/invitation/org-team lifecycle actions actually call
  `logAuditEvent()`. **Contract creation, milestone/payment status
  changes, dispute raise/resolve, and talent verification decisions —
  arguably the highest-stakes actions on the platform — are never
  written to the audit log at all.** This matches what Stage 0's own
  original audit flagged and was never subsequently closed.
- **Data retention: none.** No stated retention policy anywhere in the
  repo, no scheduled deletion/anonymization job (the only cron job that
  exists expires stale opportunity listings, unrelated), no account-
  deletion flow of any kind (self-service or staff-assisted).
- **Consent: partial.** Real in-product consent exists for assisted
  onboarding and for talent-profile publication — but there is **no
  signup-time privacy-policy/terms acceptance** anywhere; the signup
  form captures only intent, name, email and password.
- **Monitoring/alerting: none.** No Sentry/Datadog/LogRocket or
  equivalent anywhere in either `platform/` or `backend/api/`. Backend
  error handling logs to stdout only (`console.error`), with no external
  sink. A bare `/health` endpoint exists in `backend/api`, but nothing
  in-repo confirms anything external actually polls it.
  Both `platform/` and `backend/api` also carry over the
  known privacy gap flagged at Stage 0 and never subsequently closed —
  see `docs/stage-0-audit-and-integration-map.md`.
- **GDPR-style data-subject rights: none.** No self-service data export,
  no account deletion, for either talent or employer accounts.
- **Secrets hygiene: clean.** No committed real credentials found beyond
  the already-documented, intentionally-public Supabase anon keys.

## 7. Feature-flag and staged rollout plan

**What exists today:** exactly one real, wired-up feature flag —
`REAL_PAYMENTS` (`ADORWORKS_FF_REAL_PAYMENTS` env var, defaults off),
gating whether `payMilestone()` calls the real MTN MoMo adapter (built,
untested against a live sandbox) or the m-Gurush stub (deliberately
non-functional) versus the existing fully-simulated flow. This is a real
precedent for staged exposure, not a fabricated mechanism — but it's the
*only* flag; there's no general feature-flag service (LaunchDarkly,
Statsig, or even a simple in-house table-driven flag system) for staging
anything else.

**Realistic rollout sequence, given no staging environment exists:**
1. Confirm `ADORWORKS_FF_REAL_PAYMENTS` is unset (off) in Vercel's
   production environment variables before any deploy — the single most
   consequential flag on the platform.
2. Push to `main` (this *is* the deploy — Netlify/Vercel/Render all
   auto-deploy from it). There is no promotion gate between "candidate"
   and "live" beyond this document's own sign-off.
3. Immediately after deploy, smoke-test by hand: sign in as each of the
   three account types (talent, employer, staff) and confirm each
   dashboard loads without error. No automated smoke-test harness exists
   for this — it is a manual step.
4. Because AdorWorks is already explicitly a "founding pilot" (its own
   marketing copy says so), the practical staged-rollout unit is the
   *pilot cohort itself*, not a percentage-based flag rollout — continue
   onboarding new talent/employers gradually through the existing
   staff-assisted intake funnel rather than opening self-service signup
   to broad public traffic, until the gaps in §6 are addressed.

**Monitoring thresholds:** cannot be meaningfully defined given §6's
finding that no monitoring/alerting exists — there is no dashboard or
alert to set a threshold on yet. The nearest available signal today is
the staff console's own "Trust queue / Workload / Marketplace health"
dashboard (Stage 8), which is manually checked, not alert-driven.

## 8. Rollback trigger and procedure

**Trigger conditions** (any one of these should trigger an immediate
rollback):
- A signed-in user of any role cannot reach their dashboard.
- Any error surfaces during sign-up, login, or opportunity/application
  submission for more than a handful of users.
- Any payment-related action behaves unexpectedly (even though
  `REAL_PAYMENTS` should be off, the entire simulated flow is real and
  used).
- Any RLS-related error appears in reports (would indicate the security
  fix or something adjacent to it regressed).

**Application-layer rollback (fast path):** use Vercel's and Netlify's
own dashboards to redeploy the immediately-prior successful deployment —
both platforms keep deployment history and support one-click rollback
without needing a new git operation. This is faster and lower-risk than
a `git revert` + push for an urgent rollback.

**Git-layer rollback (if the dashboard path isn't available or a
specific commit needs reverting):** `git revert <commit>` and push to
`main` — since `main` auto-deploys, this is itself the rollback
mechanism for the code layer.

**Database-layer rollback:** only migrations `0057`-`0059` (and now
`0040`) have literal, executable rollback SQL — run the exact statements
in their trailing comment via the Supabase SQL Editor, reading the
attached warnings first (§2). No migration before `0031` has any
rollback path prepared; if one of those needs undoing, it requires
ad hoc expert intervention against the live schema, not a pre-written
script — plan for this explicitly rather than assuming a rollback script
exists for everything.

## Unresolved defects, severity-ranked

| # | Defect | Severity | Status |
|---|---|---|---|
| 1 | Timesheet review bypassable by 'viewer' org role | Medium (security) | **Fixed** (`449d75c`) |
| 2 | Error/danger text fails WCAG contrast (2.82:1) | Medium (accessibility) | **Fixed** (`449d75c`) |
| 3 | Contract message thread fetch unbounded | Medium (performance/low-data) | **Fixed** (`449d75c`) |
| 4 | Migrations 0057-0059 rollback comments non-executable | Medium (release-readiness) | **Fixed** (`8296388`) |
| 5 | Contract/payment/dispute/verification actions never audit-logged | High (compliance/support) | Open — recorded, needs product decision |
| 6 | No monitoring/alerting/observability anywhere | High (operability) | Open — recorded, needs vendor decision |
| 7 | No data retention policy or account-deletion capability | High (compliance) | Open — recorded, needs policy decision |
| 8 | No signup-time consent/privacy-policy acceptance | Medium (compliance) | Open — recorded, needs copy + decision |
| 9 | Migrations 0001-0030 have no rollback documentation | Medium (release-readiness) | Open — recorded, needs disposable-DB tooling to safely close |
| 10 | e2e suite exists but unexecutable (no test Supabase project) | Medium (verification confidence) | Open — recorded, cheap to close |
| 11 | 11 files with unlabeled form inputs; no `aria-live` anywhere | Medium (accessibility) | Open — recorded, needs live-browser verification to fix safely |
| 12 | `/applications` and employer opportunity page: unbounded message queries | Low (performance) | Open — recorded, deferred to avoid a correctness regression |
| 13 | `conversation_members_insert` doesn't check `user_id = auth.uid()` | Low (security, self-disclosure only) | Open — optional hardening |
| 14 | Offers-table RLS still allows a 'viewer' to create/edit a draft | Low (already-documented scope decision) | Not a regression, no action needed |

## Recommendation: **CONDITIONAL GO**

The core marketplace mechanics are solid — every stage from Stage 1
onward went through its own independent gap-check and had real bugs
found and fixed at the time, and this final cross-cutting pass found
exactly one new security defect (now fixed) rather than a pattern of
systemic problems. No critical security, tenant-isolation, or data-loss
defect remains open.

The condition is items 5-8 and 10: **no monitoring, incomplete audit
coverage on the highest-stakes actions, no data-retention/deletion
capability, and no e2e execution in this pass.** None of these block
continuing exactly the way AdorWorks already operates today — a small,
staff-mediated founding pilot with manual oversight via the staff
console — but they are real gaps against operating at any meaningfully
larger scale, and closing at least the monitoring and audit-coverage
gaps before expanding beyond the current pilot cohort is the specific
condition being recommended, not a blanket blocker on releasing this
candidate.

**This recommendation is not a decision — it is the input to one.**
Per this stage's own instruction, Claude Code will not merge, deploy, or
treat this as approved without the product owner's explicit sign-off.
