# AdorWorks staff console

The web UI for `backend/api` — plain HTML/CSS/JS (same no-build-step
approach as the public site), deployed alongside it under `/staff/`.

## Pages

| Page | What it's for |
|---|---|
| `login.html` | Email/password sign-in (Supabase Auth) |
| `index.html` | Dashboard — queue counts, recent submissions |
| `intake.html` | Triage public-form submissions; convert into a real talent profile or organisation |
| `talent.html` | Search talent, review evidence, set verification tiers, toggle public visibility |
| `organisations.html` | Employer verification (Blueprint §5.4) |
| `opportunities.html` | Create/approve briefs; build each one's shortlist; create an engagement once a candidate is accepted |
| `engagements.html` | Delivery tracking: status, milestones, notes/audit trail, finance records (finance/admin only), reviews, disputes |
| `contracts.html` | Read-only oversight of the platform/ app's self-service flow — offers accepted into contracts, milestones, deliverables, mocked payment_events, two-sided reviews. Nothing here writes anything; every state change happens in the platform app itself |

## How it talks to the backend

Two different paths, deliberately:

- **Reads** (every list and detail view) go through the staff API
  (`backend/api`), which itself queries Supabase with the service_role
  key — this keeps one consistent place responsible for shaping the data
  each page needs (joins, filters) rather than duplicating query logic
  in both the API and the console.
- **Auth** is direct to Supabase (`staff/js/app.js` uses the
  `@supabase/supabase-js` SDK, loaded from `esm.sh` — no bundler needed)
  using the same public/publishable key as the main site. Every write
  action then calls the API with `Authorization: Bearer <session token>`,
  and the API re-derives the caller's role from that token server-side
  — the console never trusts a role it read from its own session, only
  what the API says after checking `profiles.role` itself.

## Configuration

`js/config.js` needs three values — see `../backend/README.md` for where
each comes from:

- `ADORWORKS_SUPABASE_URL`, `ADORWORKS_SUPABASE_ANON_KEY` — same as the
  public site's `js/supabase-config.js` (safe to be identical/public).
- `ADORWORKS_API_BASE_URL` — the deployed `backend/api` service's URL.
  Every write action shows a clear "API not configured" error instead of
  failing silently while this is blank.

## Creating a staff account

There's no signup form here on purpose — staff accounts are provisioned
manually:

1. Supabase dashboard → **Authentication → Users → Add user**.
2. In **SQL Editor**: `update profiles set role = 'reviewer' where id = (select id from auth.users where email = '...');`
   (swap `'reviewer'` for `matcher`, `finance`, or `admin` as appropriate
   — see the `user_role` enum in `backend/supabase/migrations/0001_schema.sql`).
3. That person can now sign in at `/staff/login.html`.

Signing in with an account that has no profile row, isn't `active`, or
isn't one of the four staff roles shows a plain "access denied" message
instead of a broken/empty console — see `requireStaffSession()` in
`js/app.js`.

## Not built yet

- No way to edit a talent's structured profile fields beyond what
  `talent.html`'s detail panel exposes (skills/languages/etc. edits still
  need a direct Supabase/SQL update, or a `PATCH /api/talent/:id` call
  from outside the UI).
- Milestones are a flat "add a title" list, not the richer per-milestone
  due-date/amount structure a production build would probably want.
- No CSV/report export for the KPI framework in Blueprint §9.2 — the
  dashboard's counts are a starting point, not that dashboard.
