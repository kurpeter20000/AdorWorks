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
3. Apply `../backend/supabase/migrations/0005` through `0008` (SQL
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
  onboarding/                Talent onboarding wizard entry (requireRole('talent'))
src/lib/
  supabase/server.ts          SSR client — Server Components, Server Actions, Route Handlers
  supabase/client.ts           Browser client — Client Components only
  supabase/admin.ts            service_role client — privileged Server Actions only, never client-side
  dal/session.ts                verifySession/requireSession/requireRole — the auth Data Access Layer
  actions/auth.ts               signup/login/logout Server Actions (Zod-validated)
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
