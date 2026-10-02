# Stage 16 — Payments, messaging and trust

Source: `ADORWORKS_FINANCIAL_INFRASTRUCTURE_AND_TRUST_PLAN_2.md` (founder,
2026-10-01). Founder decisions the same day:

- **Escrow: option A** — build the full collect → hold → release flow, but
  keep it switched off for real money until the legal questions below are
  answered and an MTN merchant agreement exists. Build the non-escrow parts
  alongside it.
- **Fees:** employers pay **2.5% on top** of the agreed amount; talent
  receives the amount **minus 7.5%**.
- **MTN MoMo Open API:** confirmed by the founder as available to South
  Sudan businesses.
- **Out of scope:** WhatsApp Business API (availability/billing in South
  Sudan unconfirmed).

## What already existed before this stage

Checked first, as the plan asked — much of the plan was partly built:

| Plan item | Already built | Missing at the start |
|---|---|---|
| Engagement + payment records | Contracts, milestones, deliverables, invoices, payment intentions/events, receipts, refunds, double-charge protection | Escrow "held" state; written terms (s.44) |
| MTN MoMo | Request-to-pay adapter (never run live), behind `REAL_PAYMENTS` flag | Live sandbox test, Disbursements, dispute window, auto-release; fee was a code constant (0%) |
| Messaging | Contract chat and pre-contract (application) chat, notifications | Live updates, contact-detail blocking, support conversations, dispute → support thread |
| Ratings | Two-sided reviews after a contract is completed (database-enforced) | "Paid" not required; dispute outcomes not recorded |
| Institutional | Organisations with registration evidence + staff verification checks, teams, invoices | INGO account type, invoice/retainer billing, batch posting, compliance export |

## Progress

### Step 1 — Fees setting and written terms ✅ (migration 0096)

- `platform_settings` table; key `fees` = `{enabled, employer_percent,
  talent_percent}`. Seeded **disabled** at 2.5% / 7.5%: the public Pricing
  page promises 0% until fees are announced. Finance/admin staff change it
  at **/operations/settings** (a reason is required; every change is in
  the audit log). If the setting can't be read, no fee is charged.
- Payments now stamp both sides: `amount` (agreed), `employer_fee_*`,
  `total_charged` (what the employer pays), `fee_*` + `net_amount` (talent
  side). The provider is charged `total_charged`. Past payments keep their
  stamped rates.
- `contract_terms`: immutable, versioned written terms per contract —
  parties (talent's legal name, shown only to the parties and staff), the
  work, duration, remuneration per milestone, fees note, ending, disputes,
  and the s.44 note. Issued when an offer/service proposal is accepted;
  re-issued as a new version when what was agreed changes (fee switches
  alone don't re-issue). Both parties see it at
  **/contracts/[id]/terms**, printable / save as PDF.
- Sign-in page claim "Built-in escrow… held safely" replaced — it
  contradicted the Trust & Safety page's "AdorWorks does not hold client
  funds" commitment.

Verified on the test project with throwaway data: terms issued at
acceptance with the right parties/total, re-issued as v2 on change with v1
kept; with fees on, an agreed SSP 1,000 milestone charged 1,025, talent net
925, stamped on the payment and shown on the receipt; settings screen
saves with a reason, records who changed it, and audits it.

### Step 2 — Paid-only ratings and dispute outcomes ✅ (migration 0097)

- **Ratings:** a BEFORE INSERT trigger on reviews (applies to every
  writer, including the service role) requires the contract completed,
  every milestone paid, and a settled payment on record. The contract page
  explains this until it's true.
- **Dispute outcomes:** disputes.outcome (talent_favour / employer_favour /
  mutual_agreement / unresolved) + outcome_summary for the parties. The
  database refuses to resolve without an outcome. Staff resolve in
  /operations (Contracts and Engagements) through a platform action that
  also un-pauses the contract, notifies everyone and audits it; the staff
  API requires an outcome too. Disputes resolved earlier show "not
  recorded" — nothing invented.
- **Public track record:** public_track_record() returns counts only
  (paid contracts, reviews received and average, disputes by outcome and
  open) for a talent or organisation; shown on the public Passport and
  next to the employer on job pages. Individual disputes stay private.

Verified on the test project: each review rule refused in turn (active,
 unpaid milestone, no payment), then accepted; resolve-without-outcome
 refused by the database and by the console; staff resolution saved with
 outcome; parties see it; anonymous visitors see counts but can't read the
 dispute; Passport and job page show the record.

### Step 3 — Live chat, contact-detail blocking and support ✅ (migration 0098)

- **Live updates:** `messages` added to the `supabase_realtime` publication;
  a `useRealtimeMessages` hook subscribes each open thread to inserts for
  its conversation. RLS (0007/0017) is what actually limits what a
  subscriber receives — enabling Realtime on the table doesn't widen
  access, Supabase re-checks the same policy per connection. Covers
  contract chat, pre-contract (application) chat and the new support
  conversations.
- **Contact-detail blocking:** a conservative filter (`lib/domain/messageFilter.ts`)
  blocks emails, phone-shaped numbers (9–13 digits with a separator or a
  leading `+`, so budget/quantity figures like "2,500,000 SSP" pass
  through) and WhatsApp/Telegram/Signal mentions. Applied as a hard block
  (the message isn't sent) to pre-contract application chat always, and to
  contract chat until the first payment has succeeded on that contract —
  after that, exchanging contact details is the parties' own call.
  Deliberately **not** applied to the free-text note on a revision
  request, which also reaches the thread via the same system-message
  path — a known, narrower gap, left out to keep this change focused.
- **AdorWorks Support:** a third conversation kind (`conversations.support_user_id`),
  one per user, created on first message. Self-service at `/support`;
  staff reply from `/operations/support`. No contact-detail filtering here
  — the user is talking to AdorWorks itself, not another marketplace
  party.
- **Disputes → support:** raising a dispute now also drops a message into
  the raiser's own support conversation (creating it if needed) with the
  contract title and the dispute description, so staff see it in the same
  inbox as everything else without hunting through contracts.

Verified on the test project: a message sent from one side of a contract
chat appeared on the other side's screen without a reload; an email, a
formatted phone number and a WhatsApp mention were each refused with the
same explanation, before the first payment; after a successful payment,
the same contract thread allowed them through; a brand-new user's first
message to `/support` created their conversation and reached staff at
`/operations/support`, whose reply appeared live back on `/support`;
raising a dispute added a message to the raiser's support conversation
naming the contract.

Found and fixed during that verification, not after it: a page loaded via
direct navigation restores its Supabase session from cookies rather than
firing a live sign-in event, and the browser Realtime client wasn't
guaranteed to have wired that restored session's JWT onto the socket
before `useRealtimeMessages` subscribed — Postgres then evaluated RLS
with no `auth.uid()` at all, so a genuinely new message from the other
party was silently never delivered to a page that was already open
(confirmed with two real browser contexts, not just a same-page send).
Reproduced reliably, then fixed by explicitly awaiting
`supabase.auth.getSession()` and calling `supabase.realtime.setAuth()`
before subscribing, re-verified clean after. Everyone's *own* sent
message always appeared regardless (that path never depended on
Realtime), which is why this needed a second, cross-party browser to
catch at all.

### Step 4 — MTN MoMo live sandbox, Disbursements, escrow ✅ (migration 0099)

- **Collections verified live.** Real sandbox credentials (Collection
  product, provisioned via MTN's self-service `/v1_0/apiuser` API), token
  auth, request-to-pay and status polling all confirmed working against
  `sandbox.momodeveloper.mtn.com` — both a `SUCCESSFUL` outcome and
  several distinct `FAILED` ones came back exactly as the existing
  `paymentProviders.real.ts` adapter expects. Found live: the Collections
  and Collection Widget products are different subscriptions with
  different keys — the adapter needs the plain Collection key. Env vars
  renamed to `MTN_MOMO_COLLECTION_*` (from unprefixed `MTN_MOMO_*`) now
  that Disbursements has its own, separate `MTN_MOMO_DISBURSEMENT_*` set
  — using one product's credentials against the other's endpoints fails
  outright, so the prefix makes that mix-up impossible to make silently.
- **Disbursements built and verified live.** New `payoutProviders.ts`
  (simulated, same shape as `paymentProviders.ts`) /
  `payoutProviders.real.ts` (real MTN transfer adapter, same
  token+transfer+poll shape as Collections) / `payoutProviders.server.ts`
  (the `REAL_PAYMENTS`-gated seam). Verified live the same way as
  Collections, same sandbox project, its own subscription key.
- **Known sandbox test-number behaviour** (found live, 2026-10-01, for
  both Collections and Disbursements): `256774290781` and `0912345678`
  →  `SUCCESSFUL`; `46733123450` → `FAILED` (`INTERNAL_PROCESSING_ERROR`);
  `46733123451` → `FAILED` (`APPROVAL_REJECTED`); `46733123454` → stays
  `CREATED` (never resolves, simulating an ignored prompt); `46733123456`
  → `FAILED` (`PAYEE_NOT_ALLOWED_TO_RECEIVE`); `46733123457` → `FAILED`
  (`NOT_ALLOWED`). Not MTN's own published table — found by trial against
  the live sandbox, kept here since nothing else documents it.
- **Escrow:** built in full, switched off (`platform_settings` key
  `escrow`, same enable/disable + reason-logged pattern as fees). When
  on, a milestone's employer-side charge still succeeds immediately as
  before (`payment_events.status='succeeded'`, milestone `paid`) — escrow
  is a second, independent dimension on the same row
  (`escrow_status`/`dispute_window_ends_at`/`disbursement_*`), not a new
  milestone status, so nothing else that already checks "is this paid?"
  needed to change. A held payment becomes eligible for release once its
  dispute window passes *and* the contract has no open dispute
  (`escrow_release_eligible()`, security-definer + an internal
  `is_staff()` guard — this carries payment amounts and talent ids across
  every contract, so unlike the anon-callable
  `public_track_record()` it must never answer a non-staff caller).
  Release itself is staff-triggered from `/operations/payouts`, not fully
  automatic yet: disbursement needs an outbound HTTP call, which plain
  SQL/pg_cron (the only scheduling this codebase has — see 0045) can't
  make. `/operations/payouts` only ever shows rows
  `escrow_release_eligible()` already says are due, so this is a
  one-click action on a pre-filtered queue, not an unreviewed bulk
  release — wiring a scheduled HTTP trigger to call the same action is
  the natural next step once a deployment platform's cron and the legal
  questions below are both settled. The talent-facing notification/email
  for a held payment says so honestly ("received and held until…"), not
  "you were paid" — that would be false while escrow holds it.

Verified on the test project: a milestone payment with escrow on recorded
`escrow_status='held'` with a dispute window; the held amount appeared at
`/operations/payouts` once (test-backdated) due; releasing it called the
simulated payout provider, recorded `escrow_status='released'` with a
disbursement reference, and notified the talent — all through the real
UI, not a direct DB check. Both the Collections and Disbursements real
adapters were also exercised directly against MTN's live sandbox outside
the app (not through `REAL_PAYMENTS`, which stays off).

### Step 5 — Institutional (INGO) account track ✅ (migration 0100)

- **Organisation type:** `organisations.org_type` (individual/company/ngo/
  ingo/government/other) — self-declared at signup/edit, staff can
  correct it during verification review at `/operations/organisations`
  (a separate, lighter endpoint from the verification-decision override,
  since getting the type right isn't itself a verification decision and
  shouldn't need the same mandatory written reason). Previously the only
  classification was the free-text, non-enforced `sector` hint string —
  that stays as-is for the actual sector; `org_type` is a new, real
  dimension specifically for institutional billing eligibility.
- **Invoice + bank-transfer billing:** ngo/ingo/government orgs settle a
  milestone by invoice instead of mobile money — real institutional
  procurement pays by bank transfer against an invoice with payment
  terms, not mobile money, and this codebase has no bank-transfer payment
  *gateway* to automate that. `approveDeliverable()` already raised an
  invoice (a `finance_records` row) automatically for every milestone
  before this stage; for an institutional org it now also stamps
  `payment_terms_days`/`due_date` (Net 30) onto that same row. Staff
  confirm the transfer cleared at `/operations/invoices`
  (`confirmInstitutionalPayment()`) — deliberately not self-serve (an
  org confirming its own payment is an obvious fraud vector) — which
  creates the payment_events row (`provider_name='bank_transfer'`,
  `is_simulated` always false — there's no simulated version of a human
  checking a bank statement) and from there feeds into the exact same
  escrow/fee pipeline every other payment uses (step 4).
- **Compliance export:** any member of an org can download a CSV of
  their own contracts, milestones and payments from `/organisation` —
  donor/audit reporting is a routine institutional need, and this is the
  same data already shown one contract at a time, just flattened.
- **Batch posting:** `/organisation/opportunities/batch` — shared
  settings (type, category, work mode, engagement, pay basis, currency,
  deadline, shortlisting) entered once, then up to 10 role rows
  (title/skills/location/amount) submitted together, each becoming its
  own `pending_review` opportunity reviewed individually by staff exactly
  like one posted alone. Not a CSV upload — a program hiring several
  near-identical roles (e.g. the same position in three locations) is the
  target case, not bulk data migration.

Verified on the test project, through the real UI: an INGO's milestone
raised an invoice with Net 30 terms and a due date the moment its
deliverable was approved; the contract page showed "awaiting bank
transfer" with the amount and due date; staff confirmed it at
`/operations/invoices` with a bank reference; the resulting payment_events
row recorded `provider_name='bank_transfer'`, `is_simulated=false`,
milestone marked paid, and the contract page then showed the normal
paid/receipt state with "Bank transfer" as the provider.

## Unresolved — needs a South Sudanese lawyer

Not decided in code; flagged as the plan asked.

1. **Private Employment Agency licensing (Labour Act 2017, s.37).** Does a
   digital matching platform need the Labour Commissioner's licence?
   Unresolved.
2. **Holding client funds (escrow).** Collecting an employer's money and
   paying it out later is likely a regulated payment activity (Bank of
   South Sudan). The public site currently states AdorWorks does not hold
   client funds. Escrow stays off for real money, and that statement
   stays, until this is answered.
3. **Employee vs independent contractor (s.4(5)).** When an engagement
   looks like controlled, exclusive, full-time work, the employer may carry
   employment obligations. A plain-language note to employers at posting
   time is planned; the legal line needs counsel.
