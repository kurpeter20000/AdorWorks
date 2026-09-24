# S14-14: self-red-team pass

**This is not a penetration test.** A real pentest is performed by
someone with no prior knowledge of the codebase, using tools and
techniques this document doesn't attempt (fuzzing, timing attacks,
dependency-chain exploitation research, social engineering). What
follows is a structured attempt to think like an attacker against a
codebase I already know in full — useful for catching things a
line-by-line code review misses, but it cannot substitute for genuine
independent testing (S14-14's own tracker wording already anticipates
this; this document is the evidence package for that review, not the
review itself, same framing as `stage-14-backup-restore-evidence.md`
uses for S14-13).

Method: for each attacker goal below, describe the attempt, what
actually happens against the current codebase (traced through real
code, not assumed), and whether it succeeds, is blocked, or is
untested.

## Goal: read another user's private data

**Attempt**: authenticate as talent A, try to fetch talent B's
`talent_evidence` row directly via the Supabase client (bypassing the
UI entirely — anyone with the anon key, which is public by design, can
issue arbitrary REST calls against any table).
**Result: BLOCKED.** `talent_evidence`'s RLS policy scopes SELECT to
`user_id = auth.uid() or is_staff()` — no client-side code path can
widen this, since RLS is enforced at the database layer regardless of
what request shape reaches it. Verified via S14-03's full RLS read
this stage, not assumed.

**Attempt**: as an employer, read another organisation's applicants by
guessing/enumerating `applications` row IDs.
**Result: BLOCKED.** `applications_select` scopes to the talent owner,
staff, or an org write-member of THAT application's own organisation —
confirmed no policy in the schema compares against a caller's org
membership without binding to the target row's own `organisation_id`
(S14-03's explicit finding #9, "no cross-organisation leakage found").

## Goal: escalate privilege

**Attempt**: as a talent account, PATCH my own `profiles.role` to
`admin` directly via the Supabase client.
**Result: BLOCKED**, twice over — RLS's `profiles_update` policy
technically allows the column, but the `guard_profiles_update` trigger
(0008) explicitly rejects any role/status change except the one safe
self-toggle (talent ↔ individual_client) unless the caller is staff or
service_role.

**Attempt**: as a single compromised admin account, promote a second
account to admin to establish persistence.
**Result: PARTIALLY BLOCKED.** Maker-checker (`role_change_requests`,
0036) requires a second, different admin to approve — a lone
compromised admin can create the REQUEST but not approve it
unilaterally. Two simultaneously compromised admin accounts would
succeed — a real, named residual risk in the threat model, not
resolved here.

**Attempt**: as a staff account (reviewer) that completed password
login but never verified TOTP MFA, call `backend/api`'s staff-only
routes directly with the raw access token, bypassing the platform
app's own MFA-redirect UX.
**Result: this was NOT blocked before this stage — S14-02's most
severe finding, now fixed and verified live** (real aal1 token
rejected, real aal2 token from an actual TOTP enrollment accepted).
Documented in full in `docs/governance/decision-log.md`'s 2026-09-19
entry.

## Goal: cause financial harm

**Attempt**: as a reviewer-role staff account (no other financial
authority anywhere in the app), issue a refund on a dispute to move
money back to an account I control.
**Result: this succeeded before this stage — S14-04's finding, now
fixed** (route-specific `requireFinanceStaff` gate added).

**Attempt**: as an org member with 'viewer' role (meant to be
read-only per 0039's own design intent), approve a milestone payment
or accept an offer on the organisation's behalf.
**Result: BLOCKED for the sampled paths** — `acceptServiceProposal`/
`declineServiceProposal` explicitly check `membership.role !== "viewer"`
(S14-04's audit, not just a role-name check). **Untested**: whether
every other org-write action (screening questions, starting a
conversation) enforces this consistently — S14-03's audit flagged
`screening_questions_write`/`conversations_insert` as still using the
broader `is_org_member()` rather than `is_org_write_member()`, a
documented, accepted partial-rollout gap, not newly discovered here.

## Goal: harass or abuse another user

**Attempt**: mass-file reports against a competitor's listings to get
them removed/flagged.
**Result: this had no limit before this stage — now rate-limited**
(10/60min per reporter, S14-05).

**Attempt**: brute-force a staff account's TOTP code after obtaining
their password (phishing, credential reuse from a breach elsewhere).
**Result: this had no limit before this stage — now rate-limited**
(5/15min, S14-05) — same window as login's own brute-force protection,
closing what was the single largest remaining gap in this category.

**Attempt**: "sign up" repeatedly with a real person's known email
address to spam them or pollute their account.
**Result**: Supabase's own signUp() silently no-ops for an already-
registered email (returns a fake-success response, not an error) —
but the code used to still write a notification into that real
account on every attempt. **Fixed this stage** (S14-02) — the
unauthorized-write path is closed, though the underlying "no-op
response either way" behavior remains (by Supabase's own design, not
this app's choice).

## Goal: upload malicious content

**Attempt**: upload an HTML/JS file disguised as a registration
document to `org-documents`, then get a staff reviewer to open it,
hoping the browser renders it as live content instead of downloading
it (stored XSS against a staff session, scoped to the storage origin).
**Result**: the MIME-restriction gap that made this plausible is fixed
this stage (S14-09 — `org-documents` now only accepts jpeg/png/webp/pdf
server-side). **Still true, lower severity**: no signed URL anywhere
passes `{ download: true }`, so files open inline — no longer
exploitable via a malicious MIME type for this bucket specifically,
but a real hardening gap in principle if any bucket's allowlist were
ever loosened later. Named, not fixed — see the ASVS assessment's V8.3
entry.

**Attempt**: upload a file larger than intended to exhaust storage or
bandwidth.
**Result: BLOCKED** — every bucket now has a server-side
`file_size_limit` (confirmed for all 9 as of this stage).

## Goal: deny service

**Attempt**: flood the login endpoint with credential-stuffing
attempts.
**Result: PARTIALLY BLOCKED** — 5 attempts/15min by email, but no
IP-based limit exists alongside it, so a distributed attempt spread
across many target emails from one source isn't specifically
throttled. Named as a residual gap in the threat model already, not
newly found here.

**Attempt**: send a request designed to hang the server indefinitely
(slow-loris-style, or triggering a call to a slow/unreachable
dependency).
**Result: this was directly exploitable before this stage** — `proxy.ts`'s
unbounded `getUser()` call meant ANY slow/unreachable state on
Supabase's side would hang every single page load platform-wide with
no bound at all (found and fixed while investigating an unrelated CI
performance issue, see `decision-log.md`'s 2026-09-24 entry — not
originally found via red-teaming, but exactly the class of issue this
exercise exists to catch, so recorded here for completeness).

## Goal: tamper with evidence of misconduct

**Attempt**: as a staff account, edit or delete an existing
`risk_flags` row to hide a fraud flag on my own account or an
associate's.
**Result: this succeeded before this stage — S14-11's finding, now
fixed** (RLS restricted to SELECT-only; writes require the service-role
client, which only the audited `backend/api` route uses).

**Attempt**: as a staff account, delete or alter an `audit_events` row
to erase evidence of my own prior action.
**Result: BLOCKED** — no UPDATE/DELETE policy exists for any
RLS-governed identity; only the service-role credential (held by
whoever has direct Supabase dashboard access) can touch this table.

## Summary

Of 9 attack goals attempted, this session's audits and fixes closed 6
real, previously-exploitable paths (MFA bypass, unauthorized refund,
report/MFA-challenge brute-force, unauthorized cross-account write,
malicious file upload via missing MIME enforcement, unbounded-request
DoS, and risk-flag tampering). 3 remain named-but-accepted residual
gaps (two-admin-collusion, IP-based login throttling, viewer-role
partial rollout on a few remaining routes) — each already documented
in the threat model or this stage's audit findings, not newly
discovered by this exercise, and each judged acceptable for pilot
scale rather than silently ignored.

## What this document is not

- Not independent verification — written by the same engineer who
  built most of the mitigations described, same limitation
  `threat-model.md`'s own "What this document is not" section names.
- Not exhaustive — a real pentest would attempt dependency-chain
  exploitation, timing/side-channel attacks, and social engineering,
  none of which this document attempts.
- Not a one-time exercise — worth repeating whenever a major new
  feature ships, same trigger as the threat model itself.
