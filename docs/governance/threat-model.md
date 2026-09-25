# Threat model (S14-01)

A structured view of what AdorWorks protects, who might attack it, how,
and what's already in place to stop them — not a substitute for an
independent security review (S14-02 through S14-17 cover that review's
individual pieces; this document is the assets/actors/boundaries/
mitigations framing those reviews sit on top of, per this criterion's
own wording).

Written from full knowledge of the codebase as of 2026-09-19 (migration
`0088`) — see `docs/governance/schema-and-ownership-map.md` for the
underlying table inventory this draws on.

## Assets — what's worth protecting, ranked by real-world harm if lost

1. **Auth credentials and session tokens** (Supabase Auth — passwords
   never stored by AdorWorks directly, session cookies). Compromise
   here means full account takeover — everything below follows from it.
2. **Personal data**: full names, phone numbers, email addresses,
   identity/verification documents (`talent_evidence`), location/
   organisation details. Real harm to real people if leaked, especially
   given the pilot context (a small market, low anonymity).
3. **Financial data**: `payment_events`, `payment_intentions`,
   `finance_records`. Currently simulated (`is_simulated` always true,
   `ADORWORKS_FF_REAL_PAYMENTS` off) — today's real-world exposure is
   limited to what the records themselves reveal (who was "paid" how
   much for what), not actual movable funds. This changes materially
   the day real payments go live; revisit this document's severity
   ranking at that point, not assumed unchanged.
4. **Trust/safety data**: `reports` (especially the `safeguarding`
   reason, admin-only per 0084), `risk_flags`, `verification_checks`,
   `talent_evidence`. Exposure or tampering here could directly enable
   the kind of harm (exploitation, fraud) the platform exists to guard
   against — this is qualitatively worse than a generic data leak.
5. **Platform integrity**: `audit_events` (the accountability record
   for every sensitive staff/system action), RLS policies themselves,
   `profiles.role`/`status` (who can do what). If an attacker can
   escalate their own role or silently alter/erase the audit trail,
   every other control's evidentiary value collapses.
6. **Availability**: the platform being reachable at all. Lower
   severity than the above for a pilot-stage marketplace (a temporary
   outage is recoverable; a data breach or safeguarding failure isn't),
   but still real — see "Denial of service" below.

## Actors

| Actor | What they can normally do | Why they might attack |
|---|---|---|
| **Anonymous/unauthenticated visitor** | Browse public marketing pages, the public talent-profile view, submit intake forms | Scrape data, probe for open endpoints, attempt account creation abuse |
| **Talent account** | Manage own profile, apply to opportunities, message contract counterparts | Access another talent's private data, escalate to staff privilege, bypass verification |
| **Employer account** (individual_client/employer/org_member/org_admin) | Post opportunities, review applicants, manage contracts | Access another organisation's applicants/data (competitive intelligence), bypass payment/verification gates |
| **Staff account** (reviewer/matcher/finance/admin) | Elevated access via `is_staff()`; admin has the broadest reach | A compromised OR malicious-insider staff account is one of the highest-impact scenarios — full read access to most tables, some write access to sensitive state (verification, suspension, finance) |
| **A legitimate user acting in bad faith** | Anyone with a real account | Harassment via messaging, fraudulent job postings, fake credentials, mass-reporting to silence a competitor, spam applications |
| **External attacker with no account** | Nothing, by default | Credential stuffing against login, exploiting an unpatched dependency, hitting an endpoint that turns out to be unauthenticated by mistake |

## Trust boundaries

- **Browser ↔ platform app (Next.js)**: the primary user-facing
  boundary. Server Actions are the mutation surface; Next.js's built-in
  Origin-header check is the CSRF boundary here (confirmed as part of
  S14-04/S14-10's review — see that finding for version/config detail).
- **Platform app ↔ Supabase (RLS-governed)**: the client-side Supabase
  client (anon key) is genuinely public — RLS is the only thing standing
  between "authenticated as any user" and "can read/write anything."
  This is the single most consequential boundary in the system (S14-03's
  scope).
- **Platform app (Server Actions) ↔ Supabase (admin/service-role
  client)**: a SECOND, narrower boundary — the admin client bypasses RLS
  entirely, so every Server Action using it is personally responsible
  for its own authorization check. There is no RLS safety net here if a
  Server Action's own check is wrong or missing (S14-04's scope).
- **staff/ (static JS) ↔ backend/api (Express)**: staff console pages
  hold no privilege themselves — every privileged action goes through
  `backend/api`, authenticated via a Supabase-issued bearer token
  checked by `requireAuth`/`requireStaff`/`requireAdmin`
  (`backend/api/src/middleware/auth.js`). `backend/api` also uses the
  service-role client, so — same as above — its own per-route checks
  are the only thing enforcing least privilege, not RLS.
- **AdorWorks ↔ third-party vendors**: see
  `docs/governance/third-party-vendors.md` (built for S13-11) — Supabase
  and Render both hold service-role-equivalent access; a compromise of
  either vendor's own security is effectively a compromise of the whole
  system, not just "a vendor."

## Abuse cases and current mitigation status

Organized by actor. "Mitigated" means a specific, named control exists;
"needs independent review" flags exactly the items S14-02 through
S14-17 exist to verify — this document doesn't re-verify them itself
where a dedicated review item already covers it more precisely.

**Anonymous visitor**
- *Credential stuffing / brute-force login* — mitigated: `auth_rate_limit_attempts`
  (5 attempts/15min by email, `platform/src/lib/domain/rateLimit.ts`).
  S14-05's review found this originally covered login/signup/password-
  reset only — closed in stages: invitations/reports/MFA-challenge
  gained the same table-backed limit (0089/0090, 2026-09-24). File
  uploads were a harder case — every upload goes straight from the
  browser to Supabase Storage, never through a Server Action, so no
  application-level check would ever run; closed instead with a
  Postgres trigger on `storage.objects` reusing `check_rate_limit()`
  (0094, 2026-09-26; 30 uploads/15min per user, exempting staff/
  service-role; verified live — 30 succeed, the 31st is rejected).
  `backend/api` having no rate-limiting middleware at all was also
  closed 2026-09-26: a global `express-rate-limit` (300 requests/15min
  per IP, in-memory — a single Render instance, no cross-instance
  state to lose) now sits ahead of every route in `src/app.js`.
- *Account enumeration via login/signup error messages* — confirmed
  gap by S14-02's review; the S14-05 follow-up (2026-09-24) found the
  literal error-message leak doesn't actually trigger (Supabase itself
  suppresses the error for an already-registered email, verified
  live), but surfaced a real bug instead — fixed by checking Supabase's
  own `identities: []` signal. See the 2026-09-24 decision-log entry.
- *Scraping public talent profiles at scale* — not specifically
  mitigated (no scraping-rate-limit distinct from general rate limits);
  acceptable residual risk for a public-profile feature by design, but
  worth naming rather than ignoring.

**Talent / Employer account (horizontal privilege escalation — accessing another account's or organisation's data)**
- *Reading another organisation's applicants, contracts, or financial
  records* — mitigated: S14-03's full table-by-table RLS read (86
  migrations) confirmed no cross-organisation leakage anywhere in the
  schema — every org-scoped policy binds to the target row's own
  `organisation_id`, no exception found.
- *Modifying another user's profile, application, or contract state* —
  same as above; RLS `using`/`with check` clauses are the control,
  confirmed intact by S14-03, including both historical RLS-recursion
  bugs (0017, 0060) confirmed not reintroduced by later migrations.
- *Uploading a malicious file disguised as a document/image* —
  partially mitigated: S14-09's review found 7 of 9 storage buckets
  correctly enforce server-side size/MIME limits, matching what each
  upload component already claims client-side. `org-logos` and
  `org-documents` were the two exceptions — fixed this session
  (`0087_org_bucket_upload_limits.sql`). No malware/virus scanning
  exists anywhere in the upload pipeline — accepted gap for pilot
  scale, not proposed here.

**Talent / Employer account (vertical privilege escalation — becoming staff)**
- *Self-promoting `profiles.role` to an elevated role* — mitigated:
  RLS's `profiles_update` policy plus the `guard_profiles_update`
  trigger (`0008_prevent_self_escalation.sql`) explicitly blocks any
  role change except the one safe self-service toggle (`talent` ↔
  `individual_client`). A second maker-checker layer
  (`role_change_requests`, `0036`) additionally requires a different
  admin's approval for promotion to `admin`/`finance` specifically.
- *A single compromised admin account promoting itself or others further* —
  mitigated: maker-checker requires a second, different admin (a single
  compromised admin can't unilaterally mint another admin). S14-02's
  review found staff MFA enforcement had a real gap — it only ran in
  the Next.js platform app, not `backend/api`, so a staff account past
  password login but never MFA-verified could reach every staff route
  by calling `backend/api` directly. Fixed this session
  (`backend/api/src/middleware/auth.js` now enforces the same aal2
  check, verified live with a real TOTP enrollment). A compromise of
  TWO admin accounts simultaneously still isn't specifically defended
  against beyond maker-checker.

**A legitimate user acting in bad faith**
- *Harassment via messaging* — partially mitigated: reporting exists
  (`reports`, including a dedicated `safeguarding` reason routed
  admin-only), suspension exists (`0081`) with reason required and
  session termination on suspend. No message-content filtering exists
  (by design — not proposed here, a product/policy decision, not a
  security gap). No rate limit on submitting reports either (see
  below) — a bad-faith actor being reported can't be message-spammed
  back through this path, but the *reports* endpoint itself has no
  throttle.
- *Fraudulent job postings / fake credentials* — partially mitigated:
  staff review queue for opportunities and verification evidence;
  `risk_flags` gives staff a proactive signal. Detection quality (would
  staff actually catch a sophisticated fake) is inherently a process
  question, not something code alone resolves.
- *Mass-reporting to harass a competitor or retaliate* — confirmed gap
  by S14-05's review: `reports` has no per-reporter rate limit at all.
  Not yet fixed.
- *Spam applications* — a soft daily cap exists per
  `applications.ts`'s own comment ("Anti-spam without a pay-to-apply
  model... a soft daily cap").

**Staff account (insider risk)**
- *Reading trust/safety data outside legitimate need* — partially
  mitigated: safeguarding reports are admin-only (not all staff), and
  every sensitive staff action funnels to `audit_events`. S14-11's
  review confirmed comprehensive coverage against every sensitive-
  action category (role changes, suspensions, payments, verification
  decisions, report/dispute resolutions, staff creation). There is no
  anomaly-detection layer (e.g. alerting on a staff account suddenly
  reading unusually many profiles) — acceptable for pilot scale with a
  small, named staff team, but a real gap at larger scale.
- *A staff account issuing an unauthorized refund* — S14-04's review
  found `POST /api/disputes/:id/refund` only carried the general staff
  gate, letting a reviewer/matcher (no other financial authority
  anywhere in the app) reverse a settled payment. Fixed this session —
  now requires finance/admin specifically, matching every other
  money-moving route.
- *Deleting or altering evidence of their own misconduct* — mitigated:
  `audit_events` has no UPDATE/DELETE policy for anyone except via
  direct database access (which only the founder/whoever holds the
  Supabase service-role credential can do). S14-11's review found one
  exception — `risk_flags` (0083) granted staff direct INSERT/UPDATE/
  DELETE via RLS instead of routing through the audited backend/api
  route — fixed this session (`0088_risk_flags_tamper_resistance.sql`).
  `verification_events`/`engagement_events`/`assisted_field_changes`
  are append-only (no UPDATE/DELETE policy for anyone) but allow a
  wider set of principals to INSERT directly than `audit_events` does
  (staff generally, or the assigned agent, rather than service-role
  only) — by convention/app-design rather than RLS restriction; noted,
  not changed, since nothing found exploits it today.

**Platform/system-level**
- *SQL injection* — mitigated by construction: S14-04/S14-10's review
  found zero raw SQL string concatenation and zero `.rpc()` calls
  anywhere in `platform/src` or `backend/api/src` — every DB access
  goes through Supabase's parameterized query builder. The one
  filesystem-adjacent exception (`backend/api/scripts/apply-migrations.js`,
  which executes migration file contents verbatim) takes its target
  from a hardcoded whitelist (`staging|test|local`, never production),
  not user input.
- *XSS via user-supplied content* — mitigated: zero
  `dangerouslySetInnerHTML` anywhere in `platform/src` (React's default
  escaping is relied on throughout). The plain-JS `staff/` console,
  which does NOT auto-escape, was checked file-by-file (10 files) and
  consistently routes every user-supplied field through a shared
  `escapeHtml()` helper before building `innerHTML` strings — no
  unescaped-user-text-into-innerHTML pattern found.
- *CSRF* — mitigated: Next.js 16.3.5's Server Actions get Origin-header
  verification by default (confirmed no opt-out anywhere in
  `next.config.ts`); `backend/api` authenticates via `Authorization:
  Bearer` only (confirmed no cookie-parsing middleware and no
  `credentials: true` in its CORS config), so classic cookie-based CSRF
  doesn't apply to it.
- *Dependency/supply-chain compromise* — partially mitigated.
  `backend/api`'s 3 moderate qs/body-parser vulnerabilities were fixed
  this session (`npm audit fix`, 0 vulnerabilities remaining). Platform's
  `@lhci/cli` chain (dev-only, 0 exposure in prod deps) was originally
  10 findings (7 high, 1 moderate, 2 low) — `overrides` pinning `tmp`
  and `uuid` to patched releases (2026-09-26) resolved 4 of them down
  to 0 low/moderate. The remaining 6 (all high) trace to `extract-zip`,
  which has no patched version published at all per npm's own advisory
  — accepted as residual risk (only unpacks Chrome binaries from
  Google's CDN inside CI, never untrusted input); see the 2026-09-26
  decision-log entry. No
  automated, continuous dependency-scanning exists in CI today
  (Dependabot's GitHub-native alerts are the closest thing currently
  active).
- *Secrets exposure* — clean: S14-08's review found no real secret was
  ever committed, in the current tree or anywhere in git history, on
  any branch. One local-only, git-ignored file
  (`platform/.env.e2e.local`) holds real test-project credentials
  unencrypted on disk — never committed, but flagged for the founder's
  awareness/rotation judgment given it's a live, working credential.
- *Denial of service* — not specifically mitigated beyond the hosting
  platforms' (Vercel/Render/Cloudflare) own baseline protections;
  no application-level DDoS mitigation exists. Acceptable for pilot
  scale; revisit if traffic/attack surface grows.
- *Backup/restore failure when actually needed* — mitigated in
  principle (a daily automated backup exists, `backup-production-db.yml`,
  and was verified live in a prior session finding two real bugs before
  it worked correctly); S14-13 is the formal sign-off on current
  restore-rehearsal evidence specifically.

## What this document is not

- Not a replacement for the individual S14-02 through S14-17 reviews —
  it names where each abuse case's real depth-of-mitigation is verified
  in detail, rather than re-verifying everything itself.
- Not an independent assessment — written by the same engineer who
  built most of the mitigations described, which is exactly why
  S14-14/S14-16 (independent pentest, independent senior architecture
  review) exist as separate, genuinely-independent tracker items this
  document cannot substitute for.
- Not static — this needs revisiting whenever a new feature adds a new
  asset, actor, or boundary (e.g. real payments going live, per the
  "Financial data" note above), not treated as a one-time exercise.
