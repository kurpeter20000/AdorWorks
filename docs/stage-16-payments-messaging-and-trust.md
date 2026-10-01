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

### Steps 3–5 — not built yet

3. Chat: live updates (Supabase Realtime), contact-detail blocking before
   the first payment, "AdorWorks Support" conversations routed to
   /operations, disputes opening a support thread.
4. MTN MoMo sandbox: Collections tested live, Disbursements, escrow hold +
   dispute window + auto-release, behind its own switch, off for real money.
5. Institutional (INGO) account track.

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
