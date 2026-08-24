# AdorWorks — Supabase setup

This is the database: Postgres + Auth + Storage, all provided by Supabase,
with Row Level Security doing the actual permission enforcement described
in the blueprint's §7.3 permission matrix. The `backend/api` Node service
sits on top of this for the operations that need server-side logic
(verification approval, shortlist building, audit-logged status changes)
— but even if that API had a bug, RLS is what actually stops a talent
account from reading another talent's identity documents, or an employer
from seeing the full applicant pool instead of a curated shortlist.

## 1. Apply the schema

In the Supabase dashboard → your project → **SQL Editor** → **New query**,
paste and run **every file in this folder, in numeric order** (currently
0001 through 0028 — check the folder for the current count, since this
list grows as the platform does). The first four lay the foundation:

1. `migrations/0001_schema.sql` — tables, enums, indexes
2. `migrations/0002_rls.sql` — Row Level Security policies
3. `migrations/0003_views_and_triggers.sql` — auto-profile-on-signup, the public talent view
4. `migrations/0004_storage.sql` — private storage buckets for ID docs / portfolios / org registration evidence

Everything from 0005 onward builds out the self-service marketplace app
(`../../platform/`) on top of that foundation — organisations, offers and
contracts, milestones and deliverables, messaging, disputes, timesheets,
and the full simulated payment flow (invoices, receipts, payment
intentions). Each migration file's own header comment explains what gap
it closes and why — read those if you want the history, not just the
current schema.

Every statement is idempotent (`if not exists`, `drop ... if exists` before
`create`), so if a run fails partway through, fix the error and re-run the
same file — it won't complain about things that already exist.

## 2. Create your first admin account

Every new signup starts as role `talent` (see `handle_new_auth_user()` in
migration 0003) — nobody can grant themselves staff access through the
app. To promote yourself (or a teammate) to admin so the staff console
has someone who can log in:

1. Sign up normally once through whatever auth flow the frontend/API
   ends up using (or create the user directly in **Authentication →
   Users → Add user** in the dashboard).
2. In **SQL Editor**, run:
   ```sql
   update profiles set role = 'admin' where id =
     (select id from auth.users where email = 'you@example.com');
   ```
3. From then on, promote reviewer/matcher/finance colleagues the same
   way (swap `'admin'` for the role you want). The `user_role` enum
   started in 0001 with `talent`, `employer`, `reviewer`, `matcher`,
   `finance`, `admin`, and later migrations added `individual_client`,
   `org_member`, `org_admin`, `onboarding_agent` and `partner_hub_admin`
   as the self-service platform grew — grep `user_role` across
   `migrations/` for the exact history if you need it.

## 3. Get your API keys

**Project Settings → API**:

- **Project URL** and **anon public key** — safe to put in frontend
  code (that's what the `anon` key is designed for; RLS is what keeps
  it safe, not secrecy). These go in the site's `js/supabase-config.js`
  — see `../../README.md`.
- **service_role key** — **secret**, server-only. This goes in
  `backend/api/.env`, which is git-ignored. Never put this in any
  frontend file, ever — it bypasses RLS entirely.

## 4. Employer/talent signup note

`organisations.representative_id` and `talent_profiles.id` both
reference `profiles.id` (= `auth.uid()`), so both employers and talent
need a real Supabase Auth account — there's no separate "guest" flow at
the database layer. The public intake forms (talent application,
employer brief, etc.) do **not** require an account — they write to
`intake_submissions`, which anyone can insert into and only staff can
read (see the last policy block in 0002_rls.sql). Staff convert a
promising submission into a real `talent_profiles` / `organisations` row
— and the account/auth step — through the staff console API, once that
person is ready to move past the concierge stage.

## Why RLS instead of "trust the API"

Every table above has RLS enabled with an explicit policy set — there is
no table left open by omission. A handful (`verification_events`,
`engagement_events`) have **no** insert policy for regular users at all,
which means only the `service_role` key (i.e. the backend API) can write
to them — by design, since those are audit logs that must always record
who made a change, which only the API's authenticated-and-authorized
request context can guarantee.
