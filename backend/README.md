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
2. Run the four SQL files in `supabase/migrations/` in order, via the
   dashboard's SQL Editor.
3. Promote yourself to `admin` (one SQL statement — see `supabase/README.md`).
4. Fill in `../js/supabase-config.js` with the project's URL + anon key,
   so the public site's forms start writing into `intake_submissions`.
5. `cd api && npm install && cp .env.example .env`, fill in the project
   URL + **service_role** key, `npm start`.

## Why Supabase

Chosen over rolling a custom Postgres+Auth+file-storage stack because it
gives all three (plus instant REST/GraphQL from the schema, enforced by
RLS) with no server to run yourself, on a free tier that comfortably
covers a founding pilot's traffic — a good fit for a lean early-stage
team without dedicated backend ops. The schema and RLS policies here
aren't Supabase-specific in spirit (they're plain Postgres), so moving off
it later, if it's ever outgrown, is a real option rather than a trap.

## What's deliberately NOT here

- **No payment gateway.** `finance_records` is a manual ledger — deposits,
  invoices, fees, payouts and refunds are recorded as data, but no money
  moves through this codebase. The blueprint is explicit that AdorWorks
  can't describe holding client funds as "escrow" or use an informal
  account, and no licensed local payment partner is confirmed yet
  (mGURUSH is named as one to evaluate; Stripe doesn't cover South Sudan).
  Wire up a real gateway only after that's resolved with counsel.
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
