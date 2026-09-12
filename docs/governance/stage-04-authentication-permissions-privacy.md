# Stage 4 — Authentication, permissions and privacy

Status: **Phase A audit complete.** Phase B (bounded batch) proposed
below; two items need a founder decision first.

## Phase A audit

| Step ID | What it means | Status | Evidence |
|---|---|---|---|
| S04-01 | Verify talent registration | **Already implemented** | `platform/src/lib/actions/auth.ts:36-93` — real Supabase email verification (`emailRedirectTo` → `/auth/callback`), no session until the link is clicked. Lands in the onboarding wizard (`platform/src/app/onboarding/`). |
| S04-02 | Verify employer registration | **Already implemented** | `createOrganisation` never sets `verification_status` client-side; DB triggers (`0008_prevent_self_escalation.sql`, `0010_prevent_self_escalation_on_insert.sql`) block self-verification on both update and insert paths — comment explicitly notes "so this can never self-verify." |
| S04-03 | Login/logout on every role, no stale cache after logout | **Partial** | Logout is real (`auth.ts:100-122`), a 30-minute idle timeout force-signs-out (`platform/src/proxy.ts:16-68`), both e2e-tested (`platform/e2e/auth.spec.ts`). But no page anywhere sets an explicit `Cache-Control`/`no-store` header — the "no stale page after logout" protection currently relies entirely on Next.js's implicit dynamic-render behavior (forced by reading cookies via `requireSession()`), not an explicit guarantee. Works today; fragile if that ever changes incidentally. |
| S04-04 | Password reset/recovery | **Already implemented** | `auth.ts:131-168` — enumeration-safe (same UI response regardless of whether the email exists), delegates link expiry/single-use entirely to Supabase Auth's own recovery-token mechanism. A legitimate design choice, not a gap — no reason to duplicate what Supabase already does correctly. |
| S04-05 | Rate limits / abuse controls on auth | **Missing** | No rate-limiting library anywhere in the repo (checked both `package.json` files and searched for in-house throttling code). Login, signup, and password-reset all accept unlimited attempts. Real, P0 gap. |
| S04-06 | Server-side role/org permission tests | **Partial** | `platform/e2e/authorization.spec.ts` has 3 real negative-path tests (cross-talent contract isolation, unauthenticated redirect, wrong-role route block). `backend/api/src/middleware/auth.test.js` thoroughly unit-tests the role-check logic itself (mocked, not real HTTP requests). Coverage exists but is thin relative to the number of roles/routes in the app. |
| S04-07 | Database RLS policy automated tests | **Missing** | No pgTAP or role-switching SQL test scripts exist. Every bit of authorization coverage today goes through the app layer (Playwright UI tests, mocked middleware unit tests) — nothing connects directly as different Postgres roles to assert row-level visibility against the RLS policies themselves. |
| S04-08 | Stronger protection for staff accounts (MFA) | **Missing** | No MFA/AAL2 configuration anywhere. Staff login is plain email/password (`staff/js/login.js`), gated only by `profiles.role` afterward. **Needs a founder decision** — enforcing MFA adds a real step to every staff login, a UX tradeoff worth choosing deliberately, not something to impose silently. |
| S04-09 | Record ToS/Privacy Policy consent | **Partial** | Real Terms of Use and Privacy Policy pages already exist (`terms.html`, `privacy.html`, both dated "Version 1.0"), but the signup form itself captures no consent at all — a timestamp (`profiles.consent_terms_at`) is only written much later, at onboarding step 10 ("Review"), with no policy-version field and no equivalent capture anywhere in the employer signup path. Buildable now — the legal content already exists, this is a wiring gap. |
| S04-10 | Personal data export | **Missing** | No export feature anywhere. P1, not P0 — worth a scope conversation given the pilot's current size (see below). |
| S04-11 | Account deletion / retention handling | **Already resolved** | Matches the founder's own Stage 3 decision (`docs/governance/data-retention-policy.md`): keep data indefinitely, staff-assisted deletion only, deliberately no self-service delete flow. Confirmed no such flow exists anywhere in `platform/src`. This tracker item's evidence bar ("deletion... according to the approved retention policy") is satisfied by that decision itself — flagging the overlap rather than silently building something that would contradict it. |
| S04-12 | Session expiry and revocation | **Partial** | Idle-session revocation is real (`proxy.ts:60-68`, calls `supabase.auth.signOut()` after 30 min, which revokes the refresh token server-side). JWT expiry/refresh-rotation settings live in the Supabase project dashboard, not this repo, so unverified from here. No admin-triggered "sign this user out everywhere" capability exists yet. |
| S04-13 | Profile visibility / contact privacy | **Already implemented** | Public passport view (`platform/src/app/passport/[id]/page.tsx`) reads from `public_talent_profiles`, a view that deliberately excludes phone/email/rate/consent columns (`0034_public_talent_profile_safe_projection.sql`). No RLS path exposes `profiles`' phone/email publicly (`profiles_select` restricts to the owner or staff). Deliberate, already-verified design. |
| S04-14 | Unauthorized-access tests across protected routes | **Partial** | Same coverage as S04-06 — real but thin. No test hits a `requireStaff`-gated `backend/api` route over real HTTP with a non-staff token; that coverage today is mocked middleware unit tests only. |

## Needs a founder decision

- **S04-08** — enforcing MFA for staff accounts is a real UX tradeoff
  (an extra step on every staff login), not something to decide
  unilaterally.
- **S04-10** — personal data export is P1 and the pilot is still small;
  worth deciding whether this needs a real self-service feature now, or
  whether staff manually pulling someone's data on request (mirroring
  the S04-11/retention-policy approach) is good enough for now.

## Phase B — bounded batch starting now (no founder decision needed)

- **S04-03** — add explicit `Cache-Control: no-store` on authenticated
  routes as defense-in-depth, not just relying on implicit dynamic
  rendering.
- **S04-05** — add rate limiting to login, signup, and password-reset.
- **S04-09** — wire real consent capture into both signup forms
  (talent and employer), storing policy version + timestamp + source,
  using the Terms/Privacy Policy that already exist.
- **S04-06/S04-07/S04-14** — add a modest set of additional negative-path
  tests (not exhaustive coverage of every table/route — that's a larger,
  ongoing effort worth tracking separately, not a one-shot fix here).

S04-12's admin "sign out everywhere" capability needs a quick look at
what Supabase's admin API actually supports before committing to an
approach — will report back rather than assume.
