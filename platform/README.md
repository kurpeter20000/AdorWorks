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
3. Apply `../backend/supabase/migrations/0005` through `0011` (SQL
   Editor, in order) if you haven't already — this app's auth/roles
   code depends on them. See `../backend/supabase/README.md`.
4. `npm run dev` → <http://localhost:3000>

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
src/lib/
  supabase/server.ts          SSR client — Server Components, Server Actions, Route Handlers
  supabase/client.ts           Browser client — Client Components only
  supabase/admin.ts            service_role client — privileged Server Actions only, never client-side
  dal/session.ts                verifySession/requireSession/requireRole — the auth Data Access Layer
  actions/auth.ts               signup/login/logout Server Actions (Zod-validated)
  actions/onboarding.ts         Talent onboarding wizard Server Actions
  actions/organisation.ts       Organisation + opportunity Server Actions — opportunities are always created as 'pending_review', never 'open'; staff/opportunities.html's existing "Approve & open" action is the only path to publish
  actions/applications.ts       Talent applies to an opportunity — the one direct client insert RLS actually allows on this table
  actions/offers.ts             Employer sends an offer; talent accepts/declines — both go through the admin client with their own ownership + stage checks, per 0007's design (RLS deliberately gives neither side a direct-update path here). Accepting also creates the contract + milestone row(s) — nothing further (deliverable submission, messaging) is built yet
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
