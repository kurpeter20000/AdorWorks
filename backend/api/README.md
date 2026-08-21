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

Any Node host works (Render, Fly.io, Railway, a VPS — a free tier is
enough for the pilot's traffic). Whichever you pick:

1. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_ORIGINS` as
   environment variables in that platform's dashboard — never in code.
2. Set the start command to `npm start`.
3. Point `ALLOWED_ORIGINS` at your deployed site's real origin(s) (and
   `http://localhost:8080` while you're still testing locally).
4. Once deployed, the staff console frontend (not yet built — this is
   API-only right now) calls this service's URL instead of `localhost`.
