# Local development setup (S02-04)

One walkthrough for getting the whole project running locally, in the order that actually works. Each part also has its own more detailed README — this page exists so a new engineer doesn't have to already know that, or guess the right order.

This project has four parts, and they depend on each other in this order:

```
1. Supabase project (the database everything else needs)
2. backend/api        (talks to Supabase with an admin key)
3. platform/           (talks to Supabase directly, and to backend/api not at all — see platform/README.md's "Architectural context")
4. staff/ and the root marketing site  (plain HTML/JS, talk to Supabase and backend/api directly from the browser)
```

Do them in that order — starting `platform/` before Supabase is configured will run, but nothing will actually work (every page will fail to load real data).

## 1. Supabase project (required first)

Full detail: `backend/README.md` and `backend/supabase/README.md`.

1. Create a project at [supabase.com](https://supabase.com).
2. Run every file in `backend/supabase/migrations/` **in order** (0001, 0002, 0003…) via the Supabase dashboard's SQL Editor. There is no automated migration runner yet — this is exactly what Stage 2's S02-08 is for.
3. Promote your own account to `admin` (one SQL statement, see `backend/supabase/README.md`).
4. Note down: the project URL, the **anon/publishable** key (public, safe to commit), and the **service_role/secret** key (never commit this one, anywhere).

## 2. `backend/api`

```
cd backend/api
npm install
cp .env.example .env
```

Fill in `.env` with the Supabase project URL and the **secret** service-role key from step 1. Then:

```
npm run dev      # starts on http://localhost:8787 by default
npm run lint      # added in this stage — was missing before
npm run test
```

## 3. `platform/`

```
cd platform
npm install
cp .env.local.example .env.local
```

Fill in `.env.local` with the Supabase project URL and the **anon/publishable** key (not the secret one — this file is for the browser-facing app). The file also lists optional integrations (Africa's Talking for SMS, Resend for email, MTN MoMo behind a feature flag) — leave those blank for ordinary local development; nothing required for the core app depends on them.

```
npm run dev        # http://localhost:3000
npm run lint
npm run test
npm run build       # also type-checks; this is what CI runs
```

## 4. `staff/` and the root marketing site

No install step — plain HTML/CSS/JS, no build. Fill in `js/supabase-config.js` (root site) and `staff/js/config.js` with the same public Supabase URL + anon key from step 1, then serve the folder with any static file server, e.g.:

```
npx serve .
```

## Running everything together

You generally only need `platform/` and `backend/api` running at once for day-to-day feature work (`npm run dev` in each, in separate terminals) — the root site and `staff/` are plain files you can open directly or serve on demand.

## What's still missing here (tracked, not yet built)

- No seed data yet for a fresh Supabase project — see `docs/seed-data.md` once S02-06 lands.
- No separate staging/test Supabase project — the setup above targets your own single project. Do not run anything experimental against a project with real user data.
- No disposable end-to-end test database (S02-07) — `platform/.env.e2e.example` exists but the dedicated test project it expects doesn't yet.
