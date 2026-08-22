# AdorWorks Platform

The authenticated application — onboarding, dashboards, opportunities,
contracts, messaging, and everything else that needs real state and
role-based access. Next.js 16 (App Router) + TypeScript + Tailwind CSS
v4, talking to the same Supabase project as the rest of AdorWorks.

**Architectural context:** this is deliberately separate from
`../` (the public marketing site, plain static HTML/CSS/JS). The public
site stays fast and framework-free for low-data mobile visitors; this
app exists because resumable onboarding wizards, 9-role dashboards,
messaging and contract state machines genuinely need a component
framework. Same database, two frontends. See `../backend/README.md`
and the architecture decision record in the project conversation history
for the full reasoning.

## Stack

- **Next.js 16** (App Router, Turbopack) — see `node_modules/next/dist/docs/`
  for this exact version's conventions before assuming anything from
  memory; **this version renamed `middleware.ts` to `proxy.ts`** (same
  mechanism, different filename — see `src/proxy.ts`).
- **TypeScript**, strict mode.
- **Tailwind CSS v4** (CSS-first config — see `src/app/globals.css`'s
  `@theme` block, not a `tailwind.config.js`).
- **Supabase** via `@supabase/ssr` — server client (`src/lib/supabase/server.ts`),
  browser client (`src/lib/supabase/client.ts`), and an admin/service-role
  client (`src/lib/supabase/admin.ts`) for privileged Server Actions.
- **Zod** for Server Action input validation.
- **Cache Components are NOT enabled** (`next.config.ts` has no
  `cacheComponents: true`) — a deliberate choice, since this app is
  predominantly authenticated/session-dependent content where the
  conventional dynamic-rendering model is simpler and more appropriate
  than Suspense-gating every data read for static-shell optimization.

## Setup

1. `npm install`
2. `cp .env.local.example .env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the same publishable key used in
     `../js/supabase-config.js` and `../staff/js/config.js`.
   - `SUPABASE_SECRET_KEY` — the **secret** key (`sb_secret_...`) from
     Supabase → Project Settings → API. Server-only, never exposed to
     the browser (no `NEXT_PUBLIC_` prefix) — never share this in chat
     or commit it.
3. Apply `../backend/supabase/migrations/0005` through `0016` (SQL
   Editor, in order) if you haven't already — this app's auth/roles
   code depends on them. See `../backend/supabase/README.md`.
4. `npm run dev` → <http://localhost:3000>

## Deploying (Vercel)

Not deployed yet as of this writing. Vercel is the natural host for a
Next.js App Router app — zero-config, no `vercel.json` needed. Steps:

1. Go to [vercel.com](https://vercel.com), sign in (GitHub login is
   simplest since the repo's already there), **Add New → Project**,
   import `kurpeter20000/AdorWorks`.
2. **Root Directory**: set it to `platform` — this repo has the static
   site at the root and this app in a subfolder, so Vercel needs to be
   told where the Next.js app actually is. (Framework Preset should
   auto-detect "Next.js" once the root directory is set correctly.)
3. **Environment Variables** — add these four (Project Settings →
   Environment Variables, or the import screen offers the same form):

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://cpiebggzbxshzvlzqdfn.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the publishable key (same one in `.env.local`) |
   | `SUPABASE_SECRET_KEY` | the **secret** key — paste it directly into Vercel's dashboard, never into chat |
   | `NEXT_PUBLIC_SITE_URL` | the URL Vercel gives the project once deployed, e.g. `https://adorworks-platform.vercel.app` (you may need to deploy once first to learn this URL, then add/update this variable and redeploy) |

4. **Deploy.** Vercel builds and gives you a live URL.
5. **Supabase Auth redirect allowlist** — this step is easy to miss and
   breaks signup/login silently if skipped: Supabase dashboard →
   Authentication → URL Configuration → **Redirect URLs**, add
   `https://<your-vercel-domain>/auth/callback` (and keep the
   `http://localhost:3000/auth/callback` entry for local dev). Without
   this, `exchangeCodeForSession` in `src/app/auth/callback/route.ts`
   still runs, but Supabase will refuse to redirect back to a URL that
   isn't allowlisted, and the confirmation link will fail instead of
   completing signup.
6. Every push to `main` auto-deploys from then on (Vercel's default
   GitHub integration) — same as Netlify already does for the static
   site and Render for `backend/api`.

**Custom domain**: not decided yet — this app can stay on its
`*.vercel.app` subdomain indefinitely, or move to a subdomain of a
future custom domain (e.g. `app.adorworks.com`) later without code
changes, just a `NEXT_PUBLIC_SITE_URL` update + a DNS record + adding
the new URL to the Supabase redirect allowlist alongside the old one
during the transition.

## Commands

- `npm run dev` — dev server (Turbopack)
- `npm run build` — production build (also type-checks)
- `npm run lint` — ESLint

## Structure

```text
src/app/                    Routes (App Router)
  (auth)/                    signup, login, check-email — shared card layout, no header/nav
  auth/callback/route.ts     Exchanges Supabase's email-confirmation code for a session
  dashboard/                 Role-aware landing page (requireSession)
  onboarding/                Talent onboarding wizard: basics/verification/review (requireRole('talent'))
  organisation/               Employer side: org setup, dashboard, opportunity posting (requireRole('individual_client'))
  organisation/opportunities/[id]/  Applicant review + send-offer, per opportunity
  opportunities/              Talent-facing browse of open, public opportunities + apply (requireRole('talent'))
  applications/                Talent's own applications and their stage
  offers/                      Talent's received offers, accept/decline
  contracts/                   List + detail (requireSession — either the talent or the org rep). Milestones, deliverable submit/approve/revision, mocked payment release, per-contract messaging, two-sided reviews once completed
src/lib/
  supabase/server.ts          SSR client — Server Components, Server Actions, Route Handlers
  supabase/client.ts           Browser client — Client Components only
  supabase/admin.ts            service_role client — privileged Server Actions only, never client-side
  dal/session.ts                verifySession/requireSession/requireRole — the auth Data Access Layer
  actions/auth.ts               signup/login/logout Server Actions (Zod-validated)
  actions/onboarding.ts         Talent onboarding wizard Server Actions
  actions/organisation.ts       Organisation + opportunity Server Actions — opportunities are always created as 'pending_review', never 'open'; staff/opportunities.html's existing "Approve & open" action is the only path to publish
  actions/applications.ts       Talent applies to an opportunity — the one direct client insert RLS actually allows on this table
  actions/offers.ts             Employer sends an offer; talent accepts/declines — both go through the admin client with their own ownership + stage checks, per 0007's design (RLS deliberately gives neither side a direct-update path here). Accepting also creates the contract + milestone row(s)
  actions/contracts.ts          Deliverable submit-side-effect, approve/request-revision, mocked payment release, and per-contract messaging. Every state transition here (milestone status, contract completion, work_history creation, payment_events insert) is admin-client + explicit ownership check, matching 0007's stated design — deliverable *insertion* itself is the one direct client write RLS actually allows (see the verification-form.tsx client-upload pattern this mirrors)
  actions/reviews.ts            Two-sided review after a contract completes — a direct client insert, not admin-client, because 0013's reviews_insert policy already enforces everything that matters (contract completed, reviewer_id = caller, reviewer_role matches which side of the contract the caller is actually on)
  database.types.ts             Hand-written Supabase types (see the file's own header for how to regenerate properly)
src/proxy.ts                  Session-refresh proxy (this version's renamed middleware.ts)
```

## Security notes (read before extending this)

- **Every protected page calls `requireSession()` or `requireRole()`
  from `lib/dal/session.ts`.** Don't gate access by conditionally
  rendering `null` in a layout — the Next.js auth guide is explicit
  that this doesn't stop nested routes or Server Actions from being
  reached directly. Check in the DAL, close to the data.
- **RLS is the real authorization boundary**, not this app's UI. See
  `../backend/supabase/migrations/0007` and `0008` — several tables
  (contracts, milestones, deliverables, offers-once-sent) deliberately
  have **no** direct-client UPDATE policy for regular users. State
  transitions with side effects (accepting an offer creates a
  contract; approving a deliverable can complete a contract and create
  work history) go through Server Actions using `lib/supabase/admin.ts`
  — which have already run their own `requireRole()` check first, then
  encode the actual business rule in TypeScript rather than trusting a
  wide-open RLS grant. If you're about to write a new Server Action
  that uses the admin client, ask: could a plain REST PATCH to this
  table achieve something bad if RLS allowed it? If yes, RLS should
  keep denying it and this action is exactly why it needs to exist.
- **`0008_prevent_self_escalation.sql` fixed a real bug**, not a
  hypothetical one: the original RLS design let any signed-in user
  PATCH their own `profiles.role` to `'admin'` directly, since RLS's
  row-level `UPDATE` policies never restricted which *columns* an
  owner could change. Keep this pattern in mind for any new table with
  an owner-editable row that also has a sensitive column on it
  (status, verification, anything staff-controlled).
- **`0010_prevent_self_escalation_on_insert.sql` closed the same gap on
  INSERT**, found while building the organisation/opportunity UI:
  `talent_profiles`, `organisations` and `opportunities` are never
  auto-created by a trigger the way `profiles` is — they're first
  written by an ordinary client-side insert (`saveBasics`,
  `createOrganisation`, `createOpportunity`), and the `*_insert` RLS
  policies for those tables only ever checked row ownership, never
  column values. Without 0010, a self-service user could have inserted
  their own `talent_profiles` row already `verification_tier:
  'adorcertified'`, or an `opportunities` row already `status: 'open'`
  — skipping staff review entirely on the very first write. If you add
  a table where a non-staff role can INSERT their own row *and* that
  row has a staff-controlled column, it needs a BEFORE INSERT guard
  trigger, not just a BEFORE UPDATE one — 0008 alone wasn't enough.
- **`0011_tighten_offers_and_contracts.sql` fixed two more, found while
  building `actions/offers.ts`**: `offers_insert` allowed any `status`
  at insert, not just `'draft'` (added a BEFORE INSERT guard, same
  pattern as 0010); and `contracts_insert` had an `is_org_member(...)`
  branch that let an employer create a contract for their own org with
  no accepted offer behind it at all — the talent's-consent side of
  "both parties agreed" was structurally required, the org's side
  wasn't. That branch is gone; contract creation now requires either
  staff (i.e. the admin-client Server Action) or the talent's own
  already-`accepted` offer.
- **`0012_deliverables_storage.sql` fixed a functionality gap, not a
  security one**: 0006 created the `deliverables` storage bucket but
  never gave it a `storage.objects` policy the way `talent-evidence`
  and `org-documents` got in 0004 — so it defaulted to deny-everyone
  and deliverable file upload silently couldn't work at all until this
  was added. Same "read the actual policy, don't assume it's there"
  habit that found the others, just pointed at a missing grant instead
  of an excess one this time.
- **`0013_reviews_for_contracts.sql` is a functionality/architecture
  fix**: the `reviews` table (0001) only ever referenced `engagement_id`
  — the old staff-created `engagements` table, not the new `contracts`
  model this app is built on. The self-service offer → accept → contract
  flow never creates an `engagements` row, so a review against a
  contract had nowhere to go. Added a nullable `contract_id` alongside
  `engagement_id` (same optional-either-scope pattern as
  `conversations`), plus an INSERT policy that requires the contract be
  `'completed'` and ties `reviewer_role` to which side of the contract
  the caller actually is on — otherwise a client could insert
  `reviewer_role = 'talent'` while actually being the org rep. Reviews
  stay immediately visible to both participants + staff, same as the
  original engagement-based model (no separate moderation-queue status
  was invented — nothing else in this table or `backend/api`'s
  `reviews.js` has ever had one, so adding one here would be a new
  design decision dressed up as a bug fix).
- **`0014_talent_visible_once_shortlisted.sql` fixed a real bug found by
  actually running the flow, not by reading code**: `talent_profiles_
  select` (0002) only ever allowed the talent themselves, staff, or a
  profile with `public_visible = true` — a separate, staff-only flag set
  after full verification. Once a matcher shortlists an application, the
  employer's opportunity-detail page (and the contract page after that)
  try to show that talent's `display_name`/`headline`, but the
  employer's session genuinely could not read the row. Live-testing this
  showed an applicant literally named "AdorWorks talent" with no
  headline — being shortlisted didn't actually grant the employer
  anything to evaluate. Fixed by adding the same curated-shortlist
  condition `applications_select` already uses (`stage <> 'submitted'`
  + org membership) to `talent_profiles_select` too. If you add a new
  page that joins across two tables each with their own RLS, checking
  that the *combination* actually returns real data — not just that
  each policy is individually correct — needs a real page load, not a
  read-through.
- **`0015_fix_talent_visibility_helper.sql` corrects a bug in 0014
  itself**, found by re-running the same walkthrough after 0014 and
  watching it fail at the identical assertion. 0014 used
  `is_org_member(organisation_id)`, but `applications_select` — the
  policy it was supposedly mirroring — actually uses
  `is_org_representative(organisation_id)`. Those aren't
  interchangeable: `is_org_member` checks `organisation_members`, which
  `createOrganisation` (`actions/organisation.ts`) never populates —
  only `organisations.representative_id` gets set. So 0014's new branch
  was always false for exactly the self-service orgs it was meant to
  fix. 0015 switches it to the function 0014's own description said it
  was using.
- **`0016_auto_membership_for_new_orgs.sql` fixes the actual root
  cause** behind both of the above: `is_org_member()` isn't only used by
  `talent_profiles_select` — `offers_select`/`insert`/`update`,
  `contracts_select`, and the `screening_questions`/`screening_answers`
  policies (0007) all depend on it too, and every one of them has been
  broken for self-service organisations the same way, not just the one
  this walkthrough happened to exercise first. `organisation_members`
  was only ever populated by 0005's one-time backfill ("the
  representative is also a member") for organisations that existed at
  that moment — nothing has kept that invariant true for organisations
  created since. Fixed with an `AFTER INSERT` trigger on `organisations`
  that adds the representative to `organisation_members` automatically,
  plus a one-time backfill for any organisations created between 0005
  and this migration. This is the more durable fix compared to patching
  each affected policy to also check `is_org_representative` — one
  trigger keeps the invariant true everywhere `is_org_member` is
  checked, present and future, instead of every policy author having to
  remember which of two functions is the "real" one to use.
