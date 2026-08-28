# Stage 7 — Communication, Notifications, Contracts and Payments

Status: **implemented, gap-checked and corrected** (commits `ee1de2b`,
`a35719e`, `ccbd39d`). Payment providers named directly by product
direction: MTN Mobile Money and m-Gurush. No platform fee for now, but
real fee/net infrastructure so a rate can be turned on later without
more engineering. No payment-provider credentials exist in this
environment — everything payment-related beyond the existing simulation
is scaffolding, explicitly gated off by default.

## What this delivered

- **In-app notifications** (`0058`, `notifications`) — a `notifyUser()`
  helper (fails open, same contract as the existing audit logger) wired
  into every place a user's counterpart needed to know something
  happened without refreshing a page: offer sent/accepted/declined,
  invitation received, application stage changed, milestone
  submitted/approved/paid, dispute raised/resolved/escalated, contract
  message received, introduction video reviewed. A dashboard panel
  (last 5, unread count) plus a dedicated `/notifications` page (up to
  100), both with mark-read/mark-all-read.
- **Transactional email** (`platform/src/lib/email.ts`) — Resend, via a
  plain `fetch()` POST matching the existing Africa's Talking SMS
  pattern (no SDK). `sendEmailSafely()` never throws or blocks the
  caller. Currently sent for exactly one event: a talent getting paid.
- **Platform fee/net breakdown** (`0057`, `payment_events.fee_percent/
  fee_amount/net_amount`) — modeled as a deduction from the talent's
  payout (employer pays gross, talent receives net), computed and
  *persisted at charge time* so historical records stay accurate even
  if the rate changes later. `PLATFORM_FEE_PERCENT = 0` today — an
  approved decision, not an oversight. Both the checkout screen and the
  receipt now show gross/fee/net as three separate lines instead of one
  "Amount".
- **Payment idempotency** (`0057`, a partial unique index on
  `payment_intentions(milestone_id) where status = 'processing'`) — a
  second concurrent `payMilestone()` call for the same milestone now
  fails outright on insert instead of silently charging twice.
- **Real payment adapters, off by default** (`paymentProviders.real.ts`,
  `paymentProviders.server.ts`) — an MTN MoMo adapter built from public
  API documentation (OAuth2 client-credentials, async request-to-pay,
  bounded polling) that has never run against a live sandbox, since no
  credentials exist here. A deliberate m-Gurush stub that always returns
  "isn't connected yet" — no reliable public API documentation exists
  for it, and fabricating a plausible-looking integration would be
  worse than admitting it isn't built. Both sit behind the existing
  `REAL_PAYMENTS` feature flag, which defaults off; the real module is
  loaded via a dynamic `import()` inside a dedicated server-only file
  that the client-facing checkout component never imports, so none of
  it — or its network calls — ships to the browser regardless of the
  flag.
- **Dispute-to-payment reconciliation** — a new `POST /api/disputes/:id/
  refund` endpoint marks a milestone's settled `payment_events` row
  `refunded` and records a `finance_records` `refund` entry, with a
  matching staff-console control (milestone picker + notes + confirm) on
  the existing contract detail view. Resolving/escalating a dispute now
  also notifies every party (the person who raised it, the talent, and
  the org representative), which previously happened silently.
- **Pre-contract messaging** — `conversations`/`messages` have supported
  an `application_id` scope since 0006, but nothing ever created one;
  every conversation was contract-scoped only, so an employer had no way
  to message a candidate before an offer existed. `sendApplicationMessage`
  mirrors the existing contract-scoped pattern, with a thread on both the
  employer's applicant-evaluation panel and the talent's applications
  page.

## Gap-check findings and fixes (all corrected in `ccbd39d`)

An independent review against this stage's own scope found three real
bugs, all in error-handling/partial-failure paths — consistent with
where every previous stage's gap-check has found real issues:

1. **Payment finalization writes weren't error-checked.** If the
   `milestones` update to `'paid'` failed after a successful charge, the
   milestone stayed `'approved'` and a second `payMilestone()` call
   would sail past the status guard and charge again — the idempotency
   index only blocks *concurrent* double-charging, not a sequential
   retry after a partial failure. Fixed by checking for an existing
   succeeded `payment_events` row up front and self-healing the stuck
   status instead of re-charging.
2. **A failed `payment_events` insert (after the provider charge had
   already succeeded) left the intention stuck at `'processing'`
   forever**, which the new idempotency index then used to permanently
   block every future payment attempt on that milestone — with no
   staff route anywhere to un-stick it. Fixed by marking the intention
   `'failed'` with an explicit reconciliation note instead.
3. **Both contract and application messaging could fork a conversation
   in two under a race** (two simultaneous first messages each passing
   a "no conversation yet" check) — and once forked, every later lookup
   erroring on "multiple rows" caused it to keep forking a new one on
   every subsequent message, silently. Fixed with a new migration
   (`0059`) adding partial unique indexes on `conversations.contract_id`
   / `.application_id` (with a defensive dedup pass for any pre-existing
   forks), and both send paths now catch the resulting `23505` and read
   back the winning row instead of erroring or duplicating.

## Deliberate, honest scope choices (not gaps — decisions)

- **No SMS notifications** — in-app + email only, by explicit choice.
- **MTN MoMo adapter is untested against a live sandbox** — no
  credentials exist in this environment. It should be treated as a
  best-effort implementation from documentation, not a verified
  integration, until someone tests it against MTN's real API.
- **m-Gurush is a stub, not an integration** — no reliable public API
  documentation was available; the honest choice was a clear "not
  connected yet" response rather than a fabricated request/response
  shape.
- **No message attachments in pre-contract messaging** — the existing
  `message-attachments` storage bucket policy is keyed to contract
  participants only (`is_contract_participant`); extending it to
  applications is its own follow-up, not done here.
- **0% platform fee** — approved decision; the disclosure/calculation
  infrastructure is real and ready for a nonzero rate whenever that's
  decided.

## Migrations added

Run in order, after `0056_portfolio_ordering_and_video_reports.sql`:

- `0057_payment_idempotency_and_fees.sql`
- `0058_notifications.sql`
- `0059_conversation_uniqueness.sql`

All additive; each documents its own rollback in-file.

## Tests

Platform: 52/52. Backend: 24/24. Full production build passes.

## Known gap

The payment-idempotency index and the finance_records refund path were
verified against the live schema (columns exist, backfilled correctly,
notifications CRUD/RLS confirmed) but not exercised end-to-end with real
data, since this environment currently has no contracts/milestones to
attach test rows to. Re-verify both once real contracts exist.
