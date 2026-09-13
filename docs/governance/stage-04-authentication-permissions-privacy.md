# Stage 4 — Authentication, permissions and privacy

Status: **10 of 14 resolved** (9 built and verified, S04-11 resolved by
an earlier Stage 3 decision). Both founder decisions made and acted on
(S04-08 MFA, S04-10 data export). Migrations 0061/0062/0063 all applied
and verified live against staging (see decision log, 2026-09-14, for a
real tracking-table incident found and fixed along the way — unrelated
to these migrations themselves). Remaining: S04-06/S04-07/S04-14
(deeper test coverage — real but bounded ongoing work, not a one-shot
fix) and S04-12 (a smaller admin "force re-auth" capability, scoped in
this doc but not yet built).

## Phase A audit

| Step ID | What it means | Status | Evidence |
|---|---|---|---|
| S04-01 | Verify talent registration | **Already implemented** | `platform/src/lib/actions/auth.ts:36-93` — real Supabase email verification (`emailRedirectTo` → `/auth/callback`), no session until the link is clicked. Lands in the onboarding wizard (`platform/src/app/onboarding/`). |
| S04-02 | Verify employer registration | **Already implemented** | `createOrganisation` never sets `verification_status` client-side; DB triggers (`0008_prevent_self_escalation.sql`, `0010_prevent_self_escalation_on_insert.sql`) block self-verification on both update and insert paths — comment explicitly notes "so this can never self-verify." |
| S04-03 | Login/logout on every role, no stale cache after logout | **Complete** | Logout, idle timeout and e2e coverage already existed. Added an explicit `Cache-Control: no-store` header for every signed-in request in `platform/src/proxy.ts`, so the protection no longer depends only on Next's implicit dynamic-render behavior. Typecheck/lint/tests/build all clean. |
| S04-04 | Password reset/recovery | **Already implemented** | `auth.ts:131-168` — enumeration-safe (same UI response regardless of whether the email exists), delegates link expiry/single-use entirely to Supabase Auth's own recovery-token mechanism. A legitimate design choice, not a gap — no reason to duplicate what Supabase already does correctly. |
| S04-05 | Rate limits / abuse controls on auth | **Complete** | Table-backed rate limiting (`auth_rate_limit_attempts`, migration 0063 — table-backed, not in-memory, since Vercel can run multiple instances) wired into login (by email, 5/15min), signup (by IP, 5/hour), and password-reset requests (by email, 3/15min, without weakening the existing enumeration-safety). Fails open on a DB error rather than risk locking out every user. `platform/src/lib/domain/rateLimit.ts`. Typecheck/lint/tests/build all clean. |
| S04-06 | Server-side role/org permission tests | **Partial** | `platform/e2e/authorization.spec.ts` has 3 real negative-path tests (cross-talent contract isolation, unauthenticated redirect, wrong-role route block). `backend/api/src/middleware/auth.test.js` thoroughly unit-tests the role-check logic itself (mocked, not real HTTP requests). Coverage exists but is thin relative to the number of roles/routes in the app. |
| S04-07 | Database RLS policy automated tests | **Missing** | No pgTAP or role-switching SQL test scripts exist. Every bit of authorization coverage today goes through the app layer (Playwright UI tests, mocked middleware unit tests) — nothing connects directly as different Postgres roles to assert row-level visibility against the RLS policies themselves. |
| S04-08 | Stronger protection for staff accounts (MFA) | **Complete** | Founder decided: require it. Real TOTP MFA (Supabase's own `auth.mfa` API — no new dependency) enforced in both places staff actually log in: the platform app (`/mfa-setup`, `/mfa-challenge`, gated centrally in `requireSession()`) and the real staff console (`staff/mfa-setup.html`, `staff/mfa-challenge.html`, gated centrally in `requireStaffSession()`). Every staff role (reviewer/matcher/finance/admin) must enroll and verify a factor before reaching anything else. Typecheck/lint/tests/build all clean on the platform side; both new staff-console JS files pass a syntax check. |
| S04-09 | Record ToS/Privacy Policy consent | **Complete** | New columns (`policy_consent_at`, `policy_version`, `policy_consent_source`, migration 0062), kept separate from the existing `consent_terms_at` (a different, talent-only "consent to be published" declaration — not ToS/Privacy). Signup form now has a required checkbox linking to the real `terms.html`/`privacy.html`, rejected server-side if unchecked; consent is set via the same `raw_user_meta_data` → trigger pattern already used for role assignment (no session exists yet to run a follow-up update). Covers both talent and employer signup, since they share the same form/action. Typecheck/lint/tests/build all clean. |
| S04-10 | Personal data export | **Complete** | Founder decided: staff-assisted, not self-service — same pattern as S04-11. Documented in `docs/governance/data-retention-policy.md` alongside the deletion policy. No new feature needed. |
| S04-11 | Account deletion / retention handling | **Already resolved** | Matches the founder's own Stage 3 decision (`docs/governance/data-retention-policy.md`): keep data indefinitely, staff-assisted deletion only, deliberately no self-service delete flow. Confirmed no such flow exists anywhere in `platform/src`. This tracker item's evidence bar ("deletion... according to the approved retention policy") is satisfied by that decision itself — flagging the overlap rather than silently building something that would contradict it. |
| S04-12 | Session expiry and revocation | **Partial** | Idle-session revocation is real (`proxy.ts:60-68`, calls `supabase.auth.signOut()` after 30 min, which revokes the refresh token server-side). JWT expiry/refresh-rotation settings live in the Supabase project dashboard, not this repo, so unverified from here. No admin-triggered "sign this user out everywhere" capability exists yet. |
| S04-13 | Profile visibility / contact privacy | **Already implemented** | Public passport view (`platform/src/app/passport/[id]/page.tsx`) reads from `public_talent_profiles`, a view that deliberately excludes phone/email/rate/consent columns (`0034_public_talent_profile_safe_projection.sql`). No RLS path exposes `profiles`' phone/email publicly (`profiles_select` restricts to the owner or staff). Deliberate, already-verified design. |
| S04-14 | Unauthorized-access tests across protected routes | **Partial** | Same coverage as S04-06 — real but thin. No test hits a `requireStaff`-gated `backend/api` route over real HTTP with a non-staff token; that coverage today is mocked middleware unit tests only. |

## Founder decisions — both made, 2026-09-13

- **S04-08** — require MFA for staff. Built (see the table above): real
  TOTP enrollment/challenge in both the platform app and the staff
  console, enforced centrally so no protected page/route is reachable
  by a staff account without it.
- **S04-10** — staff-assisted, not self-service (matches S04-11's
  approach). Documented in `docs/governance/data-retention-policy.md`;
  no new feature needed.

## Phase B — done

- **S04-03** — explicit `Cache-Control: no-store` on every signed-in
  request (`platform/src/proxy.ts`), not just relying on implicit
  dynamic rendering.
- **S04-05** — table-backed rate limiting on login, signup, and
  password-reset (migration 0063, `platform/src/lib/domain/rateLimit.ts`).
- **S04-09** — real consent capture wired into signup (migration 0062),
  covering both talent and employer since they share one form/action.
- **S04-08** — staff MFA, both surfaces (see above).

## Still open

- **S04-06 / S04-07 / S04-14** — deeper authorization/RLS test
  coverage. Real, but genuinely large (49 tables, dozens of routes) —
  better tracked as ongoing work than forced into a one-shot fix here.
- **S04-12** — the smaller, actually-achievable admin capability (force
  a staff-initiated password reset to invalidate a compromised
  account's refresh tokens) is scoped below but not yet built.

## S04-12 finding: a true instant "sign out everywhere" isn't possible as designed

Checked Supabase's actual admin API before building anything.
`supabase.auth.admin.signOut()` takes a JWT (access token) as its first
argument, not a user ID — it's for revoking one already-known session,
not "look up this user and end all of theirs." There's no admin method
that takes a user ID and immediately invalidates every access token
they currently hold, because Supabase's access tokens are stateless
JWTs: once issued, they stay valid until they naturally expire
(typically ~1 hour), regardless of anything an admin does afterward —
there's no per-request revocation check to intercept them early.

**What IS achievable, and worth building as a real (if imperfect)
control**: `supabase.auth.admin.updateUserById(userId, { password:
<new random password> })` invalidates that user's refresh tokens, so
once their current access token expires (≤1 hour) they can't silently
renew it and are forced to log in again. Not instant, but real — and
meaningfully better than nothing for a staff member responding to a
compromised account. Proposing this as a small addition to the staff
console rather than the fuller "sign out everywhere, immediately"
capability the tracker item's wording implies, since that fuller
version isn't actually possible without infrastructure this project
doesn't have (a revocation-check on every request).
