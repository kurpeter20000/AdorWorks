# S14-12: privacy data-flow review

Traces where personal data actually goes — collected, stored, read,
sent to a vendor, or deleted — rather than re-documenting what already
exists elsewhere. `docs/governance/schema-and-ownership-map.md` is the
table-level reference this draws on; `docs/governance/third-party-vendors.md`
is the vendor-level reference; `docs/governance/data-retention-policy.md`
is the retention/deletion reference. This document is the flow view
connecting them — where does a piece of personal data enter the
system, and everywhere it can end up.

## Personal data categories and their flow

**1. Identity data** (name, email, phone, date of birth if collected,
profile photo)
- **In**: signup form (`platform/src/lib/actions/auth.ts`), profile
  edit forms, assisted-onboarding flow (staff entering data on
  someone's behalf, `assisted_field_changes` logs every such change).
- **Stored**: `profiles`, `talent_profiles` (Supabase Postgres).
- **Read by**: the person themself (RLS `id = auth.uid()`), staff
  (`is_staff()`), and — for `talent_profiles` specifically — any
  employer whose opportunity the talent applied to, once past the
  'submitted' stage (RLS-scoped, not a blanket employer-can-see-everyone
  policy).
- **Sent to vendors**: email address → Brevo (transactional email,
  including Supabase Auth's own confirmation/reset emails); phone
  number → Africa's Talking (SMS OTP only, not for marketing).
- **Retention**: indefinite, staff-assisted deletion — see
  `data-retention-policy.md`.

**2. Verification/identity documents** (`talent_evidence`,
`verification_checks`)
- **In**: the talent's own upload during verification, or an
  onboarding agent's upload on their behalf during assisted onboarding.
- **Stored**: Supabase Storage, private bucket, server-side
  size/MIME-restricted (S14-09 confirmed this bucket already had that
  enforcement, unlike two others fixed this stage).
- **Read by**: the owner, staff reviewers only (RLS-scoped) — never a
  public or employer-facing surface.
- **Sent to vendors**: none — stays entirely within Supabase.
- **This is the single most sensitive data category in the system**
  per the threat model's own asset ranking (#2, real harm to real
  people if leaked, "especially given the pilot context — a small
  market, low anonymity").

**3. Financial data** (`payment_events`, `payment_intentions`,
`finance_records`)
- **In**: milestone payment actions (currently simulated — `is_simulated`
  always true, `ADORWORKS_FF_REAL_PAYMENTS` off).
- **Stored**: Supabase Postgres, staff/participant-scoped RLS.
- **Read by**: contract participants (their own transactions only) and
  finance-role staff.
- **Sent to vendors**: none today — MTN MoMo integration exists in code
  but is gated off and "has not been tested against a real sandbox"
  per its own env-var comment. **The day this goes live, phone-linked
  mobile-money account data and real transaction amounts would flow to
  MTN MoMo** — this document's financial-data assessment would need a
  fresh pass at that point, not be assumed to still hold.

**4. Trust/safety data** (`reports`, `risk_flags`, safeguarding-reason
reports specifically)
- **In**: any signed-in user filing a report; staff raising a risk
  flag proactively.
- **Stored**: Supabase Postgres. Safeguarding-reason reports are
  admin-only visible, not all staff (0084) — the one place this app
  deliberately narrows staff access below the general `is_staff()`
  bar, given the sensitivity of what a safeguarding report might
  contain.
- **Read by**: the reporter (their own report only), staff (or
  admin-only for safeguarding), never the reported-about person
  directly.
- **Sent to vendors**: none.
- **Now rate-limited** (S14-05, this stage) — previously anyone could
  file unlimited reports, a real vector for using the reporting system
  itself as a harassment tool against a competitor.

**5. Messages** (`messages`, contract/application-scoped conversations)
- **In**: any conversation participant.
- **Stored**: Supabase Postgres, participant/staff-scoped RLS.
- **Read by**: conversation participants and staff (for moderation/
  dispute resolution purposes).
- **Sent to vendors**: none — no message content is forwarded to
  Brevo/Sentry/etc. Sentry's error capture could incidentally include
  a message's content only if an error were thrown while processing
  that exact request, and `sendDefaultPii: false` limits what Sentry
  captures by default.

**6. Audit trail** (`audit_events`, `verification_events`,
`engagement_events`, `assisted_field_changes`)
- **In**: system-generated whenever a sensitive staff/system action
  happens — not user-submitted.
- **Stored**: Supabase Postgres, staff-read-only (or system-only for
  some), no delete/update path for anyone short of the service-role
  credential (S14-11 confirmed this tamper-resistance property holds
  across all four audit-adjacent tables as of this stage's
  `risk_flags` fix).
- **Contains personal data indirectly**: an audit event's `before`/
  `after`/`metadata` fields can include personal data as part of
  recording what changed (e.g., a role change's before/after state).
  This means the audit log itself is a personal-data store, not just
  operational metadata — worth naming explicitly, since "it's just
  logs" undersells what's actually captured.
- **Sent to vendors**: none — stays in Supabase.

**7. Error/monitoring data**
- **Vendor**: Sentry, `sendDefaultPii: false` — deliberately excludes
  IP addresses, cookies, and request headers that might carry personal
  data by default. Can still incidentally capture personal data present
  in a URL path or an unhandled exception's message/stack (e.g., an
  error thrown with someone's email in the message string) — no
  systematic scrubbing beyond Sentry's own default PII exclusion exists
  for this. Session Replay is not enabled, which is the single biggest
  privacy-relevant Sentry decision already made and documented in
  `third-party-vendors.md`.

**8. Backup copies**
- **Vendor**: GitHub Actions artifact storage, 30-day retention — a
  full `pg_dump` of production, meaning every category above exists in
  full inside that artifact for its 30-day life. Already flagged in
  `third-party-vendors.md` as "easy to overlook as a 'vendor' since
  it's also the code host, but it's carrying real user data" — repeated
  here because it's the one place ALL the categories above converge
  outside the live database.

## Cross-border transfer

`privacy.html` §4 already discloses cross-border data transfer to
users in general terms. Every vendor above (Supabase, Vercel, Render,
Brevo, Africa's Talking, Sentry, GitHub) is a global/US-or-EU-hosted
service, not a South-Sudan-local one — meaning essentially all personal
data collected from a South Sudan pilot user leaves the country by
design, not as an edge case. Whether each vendor's specific hosting
region is legally appropriate for this pilot is the same open Legal
Counsel question `third-party-vendors.md` already flags, not
re-litigated here.

## What's NOT collected (worth stating explicitly)

- No precise geolocation tracking.
- No third-party analytics/advertising trackers (no Google Analytics,
  Meta Pixel, or similar anywhere in the codebase — confirmed via the
  dependency audit finding no such package installed).
- No biometric data.
- No payment card numbers ever touch AdorWorks's own servers (real
  payments, when enabled, would go through MTN MoMo's own flow, not a
  card-entry form built here).

## Gaps and open items

- **No systematic PII-scrubbing on error logs** beyond Sentry's default
  exclusions — low-likelihood, low-volume exposure (only triggers on an
  actual unhandled error), not proposed as a fix here given the modest
  risk/effort ratio at pilot scale, but named rather than ignored.
- **The audit log itself is a personal-data store** (point 6 above) —
  worth Legal Counsel's awareness when reviewing retention/export
  obligations, since "delete my data" arguably touches audit rows that
  reference that person even though the audit table's own retention
  policy says "not deleted in the ordinary course."
- **Real-payments go-live** is the single biggest trigger for this
  entire document needing a fresh pass, not just the financial-data
  section — already flagged in the threat model's own asset-ranking
  note.

## What this document is not

- Not a legal privacy-impact assessment — Legal Counsel's own review
  (S13-01 and related, still blocked on that role being unfilled) is
  what would formally close this out.
- Not a re-statement of `third-party-vendors.md` or
  `data-retention-policy.md` — cross-referenced, not duplicated; read
  those two directly for vendor-by-vendor and retention-by-category
  detail this document doesn't repeat.
