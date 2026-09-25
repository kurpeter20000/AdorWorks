# S14-06: OWASP ASVS assessment

Maps AdorWorks's actual controls against OWASP Application Security
Verification Standard v4.0's categories, at Level 1/2 depth (the bar
appropriate for a pilot-stage marketplace handling personal and
payment-adjacent data, not a Level 3 assessment which targets
high-assurance/critical infrastructure). Written from this session's
four parallel security audits (auth/MFA, RLS/isolation, input
validation/uploads, dependencies/secrets/audit-log — see
`docs/governance/decision-log.md`'s 2026-09-19 and 2026-09-24 entries)
plus direct codebase knowledge. Self-assessed, not independently
certified — see "What this is not" at the bottom.

Legend: ✅ verified in place · ⚠️ partial/accepted gap · ❌ not done

## V1 — Architecture, design and threat modeling

- ✅ **V1.1 Secure SDLC**: this project's own governance playbook
  (16-stage tracker, decision log, this document itself) is the SDLC
  process.
- ✅ **V1.2 Authentication architecture**: single source of truth
  (Supabase Auth), documented trust boundaries in
  `docs/governance/threat-model.md`.
- ✅ **V1.4 Access control architecture**: RLS as the primary boundary
  for the client↔database path, explicit per-route middleware
  (`requireAuth`/`requireStaff`/`requireAdmin`/`requireFinanceStaff`)
  for the service-role-bypassing `backend/api` path — both documented
  in the threat model's "Trust boundaries" section.
- ✅ **V1.14 Deserialization**: no custom deserialization of
  attacker-controlled data anywhere in the codebase (confirmed during
  the input-validation audit).

## V2 — Authentication

- ✅ **V2.1 Password security**: delegated entirely to Supabase Auth
  (bcrypt hashing, configurable complexity) — AdorWorks never sees or
  stores a plaintext password.
- ✅ **V2.2 General authenticator security**: rate limiting on login
  (5/15min), signup (5/60min by IP), password reset (3/15min) — S04-05.
- ✅ **V2.3 Authenticator lifecycle**: TOTP MFA enrollment/challenge
  flow for staff roles (S04-08), now rate-limited (5/15min) as of this
  stage's S14-05 fix — previously unlimited, a real brute-force gap on
  a 6-digit code.
- ✅ **V2.5 Credential recovery**: password reset via Supabase's own
  flow, rate-limited.
- ⚠️ **V2.7 Out-of-band verifier**: phone verification exists
  (`phone_verification_codes`) but isn't a login factor — informational
  only, not a gap against this control's actual intent.

## V3 — Session management

- ✅ **V3.2 Session binding**: Supabase-issued JWT sessions, httpOnly
  refresh mechanism via `@supabase/ssr`.
- ✅ **V3.3 Session logout/timeout**: 30-minute inactivity timeout
  enforced by `src/proxy.ts`, real server-side `signOut()` (revokes the
  refresh token), not just a client-side redirect.
- ✅ **V3.7 Defense in depth**: `Cache-Control: no-store` set explicitly
  on every signed-in response (S04-03), independent of any single
  page's own rendering behavior.
- ✅ **Reliability fix this stage**: the session-refresh check in
  `proxy.ts` had no timeout — a slow/unreachable Supabase endpoint
  would have hung every page load platform-wide with no bound. Fixed
  with a 1500ms race + catch, confirmed via direct TTFB measurement
  (500ms → 15ms against a deliberately-unreachable host).

## V4 — Access control

- ✅ **V4.1 General access control**: Postgres RLS on every table with
  regular-user-reachable data (58 tables), verified via a full
  table-by-table read this stage (S14-03) — no un-scoped
  `using (true)` found on tenant/financial data, no cross-organisation
  leakage found across 9 org-scoped tables checked.
- ✅ **V4.2 Operation-level access control**: sampled 8 sensitive
  Server Actions/routes (payMilestone, acceptOffer, suspend/reinstate,
  organisation verify, timesheet review, etc.) — each checks real
  ownership/state, not just "is logged in." One gap found and fixed:
  the dispute-refund route only required general staff, not
  finance/admin specifically (S14-04).
- ✅ **V4.3 Other access control considerations**: maker-checker
  (`role_change_requests`, 0036) requires a second, different admin to
  approve a promotion to admin/finance — a single compromised admin
  can't unilaterally mint another.
- ⚠️ **Known, accepted gap**: suspended accounts retain RLS-governed
  access until their session token naturally expires or
  `backend/api`'s password-rotation-on-suspend forces re-auth — RLS
  itself was deliberately not retrofitted schema-wide for this
  (`0081_account_suspension.sql`'s own comment explains the tradeoff:
  an 80+-migration-wide change with real drift risk).

## V5 — Validation, sanitization and encoding

- ✅ **V5.1 Input validation**: 20 of 23 platform Server Action files
  and all 15 backend/api route files validate every write via zod
  before use; the 3 exceptions don't take FormData at all (confirmed
  during this stage's audit). A handful of free-text fields use manual
  length checks instead of zod — inconsistent but not exploitable,
  since every write is parameterized regardless.
- ✅ **V5.2/V5.3 Sanitization/output encoding**: React escapes by
  default (zero `dangerouslySetInnerHTML` anywhere in `platform/src`);
  the plain-JS `staff/` console, which does NOT auto-escape,
  consistently routes user-supplied text through a shared
  `escapeHtml()` helper before building `innerHTML` strings — verified
  across 10 files.
- ✅ **V5.5 Deserialization prevention**: n/a — no custom
  deserialization of untrusted data.

## V7 — Error handling and logging

- ✅ **V7.1 Log content**: `audit_events` (0035) captures every
  high-stakes staff/system action with actor, before/after state,
  reason — confirmed comprehensive against every sensitive-action
  category (role changes, suspensions, payments, verification,
  report/dispute resolutions, staff creation) this stage.
- ✅ **V7.4 Error handling**: `asyncRoute`/`HttpError` in `backend/api`
  route errors to a consistent handler rather than leaking stack
  traces; Server Actions return typed `{ message }`/`{ errors }`
  shapes, not raw exceptions.
- ✅ **This stage's fix**: signup's duplicate-email path was allowing
  an unauthenticated write (a notification) into an existing,
  unrelated account — not strictly a V7 error-handling defect (the
  error-message leak V7 would flag doesn't actually trigger, since
  Supabase suppresses it) but adjacent enough to flag here; fixed by
  checking Supabase's own `identities: []` anti-enumeration signal.

## V8 — Data protection

- ✅ **V8.1 General data protection**: `sendDefaultPii: false` on
  Sentry; no `console.log` of credentials/tokens found in the audited
  files.
- ✅ **V8.3 Sensitive private data**: identity/verification documents
  (`talent_evidence`) and org registration documents
  (`org-documents`) are private storage buckets, owner/staff-scoped.
- ⚠️ **Gap, low severity**: no signed-URL call anywhere passes
  `{ download: true }` — files open inline rather than as an
  attachment. Low risk for buckets with a server-enforced MIME
  allowlist (everything except previously org-documents/org-logos,
  both fixed this stage — S14-09); not separately fixed as
  defense-in-depth given the root cause (arbitrary file type) is
  closed. Worth a follow-up pass if capacity allows.

## V9 — Communications

- ✅ **V9.1 Client communication security**: HTTPS everywhere
  (Vercel/Render both terminate TLS by default); no plaintext
  credential transmission found.

## V10 — Malicious code

- ✅ **V10.3 Application integrity**: `npm audit` run this stage —
  `backend/api` fixed to 0 vulnerabilities; platform's 10 vulnerabilities
  (7 high/1 moderate/2 low) are entirely within `@lhci/cli`'s dev-only
  dependency chain (0 exposure in production dependencies) — an open
  decision for the founder (narrower fix would mean rebuilding CI's
  Lighthouse budget-assertion logic against a plain `lighthouse`
  install).

## V12 — Files and resources

- ✅ **V12.1 File upload**: all 9 storage buckets now have server-side
  `file_size_limit`/`allowed_mime_types` enforcement (the last two,
  org-logos and org-documents, fixed this stage — S14-09), matching
  what each upload component already claimed client-side.
- ❌ **V12.4 Malware scanning**: confirmed absent everywhere in the
  upload pipeline. Accepted gap for pilot scale, not proposed here —
  no AV/malware-scanning vendor is integrated.

## V13 — API and web service

- ✅ **V13.1 Generic API security**: `backend/api` requires a valid
  Bearer token on every route; CORS restricted to an explicit
  `ALLOWED_ORIGINS` allowlist; `helmet()` applied.
- ✅ **V13.2/V13.3**: zod validation on every route's `req.body`/
  `req.query`/`req.params`; pagination params bounded
  (`z.coerce.number().min().max()`).
- ✅ **This stage's fix**: `requireAuth` didn't check MFA/assurance
  level at all — a staff account that completed password login but
  never verified TOTP still held a fully valid token every staff-only
  `backend/api` route accepted (S14-02, the most severe finding of
  this stage, verified live with a real TOTP enrollment).

## V14 — Configuration

- ✅ **V14.2 Dependency management**: `npm audit` part of this stage's
  routine; no automated continuous scanning in CI yet beyond GitHub's
  native Dependabot alerts (already active — it opened and the founder
  merged PR #20 during this stage, confirmed via git history).
- ✅ **V14.3 Unintended security disclosure**: `backend/api` uses
  `HttpError`/a consistent error handler rather than default Express
  stack traces; confirmed no `X-Powered-By`-style leakage beyond
  Express's own default (not separately hardened — low priority, no
  sensitive info in that header).
- ✅ **V14.4 HTTP security headers**: `helmet()` on `backend/api`;
  Next.js's own defaults on `platform`.
- ✅ **V14.5 Validate CORS**: explicit allowlist, no `credentials: true`
  wildcard combination found.

## Categories not separately assessed

- **V6 (Cryptography)**: delegated to Supabase (TLS, password hashing,
  JWT signing) — not independently re-verified at the cryptographic
  implementation level, which is standard practice for a project built
  on a managed auth provider rather than a reason to skip the category
  entirely; flagged as out of this assessment's depth.
- **V11 (Business logic)**: partially covered via the 8 sampled
  Server Actions in V4.2 above; not a dedicated abuse-case-by-abuse-case
  walkthrough — see `docs/governance/threat-model.md`'s "Abuse cases"
  section for the closest equivalent.

## What this is not

- Not a certified ASVS audit — no external assessor has verified these
  claims; every checkmark above traces to a specific finding from this
  session's own audits or direct codebase reading, cited so it can be
  independently re-checked.
- Not exhaustive against every one of ASVS's ~280 individual
  requirements — mapped at the category level, prioritizing the
  requirements most relevant to what this app actually does (a
  marketplace with auth, file uploads, an admin console, and a
  service-role-bypassing internal API), not a mechanical line-by-line
  pass.
- Should be revisited whenever a major new feature area ships (real
  payments going live is the most consequential one already flagged in
  the threat model), not treated as a one-time snapshot.
