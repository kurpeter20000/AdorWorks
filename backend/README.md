# AdorWorks backend

Two parts:

- **`supabase/`** — the database. Postgres schema, Row Level Security
  policies, and private storage buckets, implementing the full data model
  from the AdorWorks Startup & Website Blueprint §7.9 and the permission
  matrix from §7.3. Start here — see `supabase/README.md`.
- **`api/`** — a small Node/Express service for the handful of operations
  RLS alone can't safely express (provisioning accounts for people
  converted from an intake form, and audited state changes like a
  verification-tier or engagement-status update). Everything else — a
  talent editing their own profile, an employer viewing their own
  opportunities — can and should talk to Supabase directly from the
  frontend with the anon key. See `api/README.md`.

## Setup order

1. Create a Supabase project (`supabase.com` → New project).
2. Run every SQL file in `supabase/migrations/` in order (numbered
   0001–0028 as of this writing — check the folder for the current count),
   via the dashboard's SQL Editor.
3. Promote yourself to `admin` (one SQL statement — see `supabase/README.md`).
4. Fill in `../js/supabase-config.js` with the project's URL + anon key,
   so the public site's forms start writing into `intake_submissions`.
5. `cd api && npm install && cp .env.example .env`, fill in the project
   URL + **service_role** key, `npm start`.

## Email deliverability (custom SMTP)

Supabase's built-in mailer (what auth emails use until this is
configured) is meant for occasional testing only — it's tightly
rate-limited and has poor deliverability to providers like Gmail, which
often drops or spam-folders mail from it rather than bouncing it. This
is why signup confirmation links can fail to arrive with no visible
error in the app: `signUp()` succeeds (Supabase accepted the request),
the email just never reliably lands.

Fix: Supabase dashboard → **Authentication → Emails → SMTP Settings** →
turn on **Enable custom SMTP**, then fill it in with a real provider's
credentials. Recommended: **Brevo** (free tier, 300 emails/day), because
it verifies a single sender email address rather than a whole domain —
no purchased domain needed yet, which matches where this project
currently is (see root `README.md`'s "Working name" / domain note).

1. Sign up at [brevo.com](https://www.brevo.com) (free plan).
2. **Senders & IP → Senders → Add a sender** — use whatever address
   should show as the "from" address (your own email is fine for now).
   Brevo emails you a confirmation link; click it. This is
   single-sender verification, not domain DNS — no domain required.
3. **SMTP & API → SMTP tab** — note the host (`smtp-relay.brevo.com`),
   port `587`, your Brevo login (used as the SMTP username), and click
   **Generate a new SMTP key** for the password.
4. Back in Supabase's SMTP form, fill in: Sender email = the address
   verified in step 2, Sender name = `AdorWorks`, Host =
   `smtp-relay.brevo.com`, Port = `587`, plus the username/password from
   step 3. Save.
5. Test end to end: sign up on the live site with a real address and
   confirm the email arrives (check spam once — a brand-new sender has
   no reputation yet, this usually clears up after the first few sends).

Never commit the SMTP username/key anywhere in this repo — it only ever
goes into Supabase's own encrypted SMTP settings field, same rule as
every other secret here. Once a real `adorworks.*` domain is secured,
switching to domain-based sender verification (in Brevo or another
provider) improves long-term deliverability/reputation, but
single-sender verification is enough to unblock real signups now.

## Why Supabase

Chosen over rolling a custom Postgres+Auth+file-storage stack because it
gives all three (plus instant REST/GraphQL from the schema, enforced by
RLS) with no server to run yourself, on a free tier that comfortably
covers a founding pilot's traffic — a good fit for a lean early-stage
team without dedicated backend ops. The schema and RLS policies here
aren't Supabase-specific in spirit (they're plain Postgres), so moving off
it later, if it's ever outgrown, is a real option rather than a trap.

## What's deliberately NOT here

- **No real payment gateway.** The marketplace app (`../platform/`) has a
  full simulated payment flow — invoices (`finance_records`), payment
  intentions, a swappable `PaymentProvider` interface with mock m-Gurush,
  MTN MoMo and card implementations, and receipts — but `is_simulated`
  never becomes `false` anywhere in the codebase, and no money moves
  through any of it. The blueprint is explicit that AdorWorks can't
  describe holding client funds as "escrow" or use an informal account,
  and no licensed local payment partner is confirmed yet (mGURUSH is
  named as one to evaluate; Stripe doesn't cover South Sudan). Wire up a
  real provider only after that's resolved with counsel — the interface
  is deliberately shaped so a real implementation slots in without
  touching any calling code.
- **No automated identity/KYC verification.** `talent_evidence` stores
  what a person submits (portfolio links, ID document files, references);
  a human reviewer approves or rejects it through the API. The blueprint
  is explicit that an automated score should never stand in as a
  complete judgment of someone's ability or worth.
- **No native mobile app.** The public site is a PWA instead (see the
  root `README.md`'s PWA section) — installable, works offline for
  visited pages, no app-store review cycle or per-platform codebase. A
  native app becomes worth its cost once there's a concrete need this
  can't meet (background push notifications are the most likely trigger,
  since PWA push support is inconsistent on iOS) — not before.
- **The staff console (`../staff/`) covers the core workflow, not every
  edge case.** Triage, verification, shortlisting and engagement
  tracking all have a working UI now; some finer-grained editing (e.g.
  reshaping a talent profile's structured fields beyond what its detail
  panel exposes) still needs a direct API call or SQL. See `../staff/README.md`.
