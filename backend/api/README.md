# AdorWorks API

The staff-console backend: verification approval, employer/organisation
verification, shortlist building, engagement tracking with a full audit
trail, and manual finance-record keeping. Plain Node.js + Express, talking
to Supabase with the **service_role** key (server-only — this is what
lets it do privileged things like approving a verification tier or
creating a login for someone converted from an intake form).

Every route requires a Supabase-issued JWT (`Authorization: Bearer
<token>`, from a normal Supabase Auth sign-in) belonging to a staff
account (`reviewer`, `matcher`, `finance` or `admin` — see
`../supabase/README.md` for how to promote your first admin). There is no
public/anonymous access to anything in this API — the public website
talks to Supabase directly for its forms (see the root `README.md`).

## Setup

1. Apply the database migrations first — see `../supabase/README.md`.
2. `npm install`
3. `cp .env.example .env` and fill in your Supabase project's URL and
   **service_role** key (Project Settings → API). Never commit `.env`.
4. `npm run dev` (auto-restarts on file changes) or `npm start`.
5. `curl http://localhost:8787/health` should return `{"ok":true}`.

## Routes

All under `/api`, all staff-only unless noted:

| Route | Purpose |
|---|---|
| `GET/PATCH /intake`, `POST /intake/:id/convert-talent`, `POST /intake/:id/convert-employer` | Triage public-form submissions; convert a promising one into a real account + profile/organisation |
| `GET/PATCH /talent`, `POST /talent/:id/verify`, `POST /talent/:id/evidence/:id/review` | Search talent, review evidence, change verification tier (audited) |
| `GET/PATCH /organisations`, `PATCH /organisations/:id/verify` | Employer verification (Blueprint §5.4) |
| `GET/POST/PATCH /opportunities`, `POST /opportunities/:id/approve` | Briefs/roles/services |
| `GET/POST/PATCH /applications` | The shortlist builder (Blueprint §5.1 step 3) |
| `GET/POST/PATCH /engagements`, `POST /engagements/:id/notes` | Delivery tracking with a full audit trail |
| `GET/POST/PATCH /finance` (finance/admin only) | Manual deposit/invoice/fee/payout/refund records — no payment gateway is called anywhere in this codebase |
| `GET /reviews` | Read-only, for the quality dashboard |
| `GET/PATCH /disputes` | Blueprint §5.7 dispute process |

Every list endpoint takes `limit`/`offset` and returns `{ data, count }`.
Every write endpoint validates its body with [zod](https://zod.dev) and
returns `422` with `details` on invalid input.

## Why this exists alongside Supabase's own auto-generated API

Supabase already gives you a full REST API from the schema, governed by
RLS — plenty of reads and simple writes (a talent editing their own
profile, an employer viewing their own opportunities) can and should go
straight from the frontend to Supabase with the anon key, no need to
proxy through here. This API exists specifically for the operations RLS
alone can't safely express:

- **Provisioning accounts for other people** (converting an intake
  submission into a real login) needs the Auth Admin API, which requires
  the service_role key.
- **Audited state changes** (`verification_events`, `engagement_events`)
  have no direct-insert RLS policy for anyone — only this API can write
  them, which guarantees every tier change and stage change actually
  gets logged, because the logging isn't optional client-side code, it's
  baked into the endpoint.
- **Cross-cutting business logic** (e.g. defaulting a new engagement's
  account owner to the staff member who created it) is easier to get
  right once, server-side, than to re-implement in every frontend caller.

## Deploying

A `render.yaml` blueprint at the repo root (one level up from here, then
up again) is already set up for [Render](https://render.com) — a Node
host with a workable free tier for a founding pilot's traffic, and
GitHub-connected auto-deploy on every push to `main`.

1. On render.com, sign in with GitHub (the `kurpeter20000` account).
2. **New +** → **Blueprint** → select the AdorWorks repo.
3. Render reads `render.yaml` and proposes one service, `adorworks-api`.
   You'll be prompted to fill in three environment variables it
   deliberately leaves blank (Render blueprints never store secrets in
   git):
   - `SUPABASE_URL` — Project Settings → API in your Supabase dashboard.
   - `SUPABASE_SERVICE_ROLE_KEY` — same page, the **Secret key**
     (`sb_secret_...`) — **not** the publishable one. This is the one
     credential in this whole project that should never appear in chat,
     a repo, or anywhere public.
   - `ALLOWED_ORIGINS` — your deployed site's real origin, e.g.
     `https://adorworks.netlify.app` (check your Netlify site's actual
     URL) — comma-separate more than one if needed, e.g. add
     `http://localhost:4321` while you're still testing locally.
4. **Apply** / **Create**. First deploy takes a few minutes.
5. Once live, `https://adorworks-api.onrender.com/health` (or whatever
   subdomain Render assigns) should return `{"ok":true}`. That URL is
   what the staff console's `staff/js/config.js` needs — not secret,
   safe to share.

Free-tier note: Render's free web services spin down after periods of
inactivity and take ~30-50 seconds to wake on the next request — fine
for a low-traffic pilot, worth upgrading to a paid instance once staff
are using the console daily and that delay becomes annoying.
