# Staging environment (S02-01, S02-05, S02-08, S02-13)

## What "staging" means for this project

Given the founder's decision (2026-09-12, see the decision log), staging **reuses the dedicated test Supabase project** rather than a third project — the free plan only allows 2 active projects, and this project already has production + the test project.

**Trade-off to know, not just once**: the automated e2e suite creates and deletes real records in this same project. Don't run `npm run test:e2e` at the same time someone's manually reviewing staging — the two will step on each other's data.

## How to apply new migrations to staging

```
cd backend/api
MIGRATE_TARGET=staging SUPABASE_DB_URL=<the test project's direct connection string> npm run migrate
```

This only applies migrations that haven't been applied yet (tracked in a `_schema_migrations` table it creates), so it's safe to run repeatedly — including right after adding a brand new migration file, which is the normal workflow going forward: write the migration, apply it to staging first with this command, check it actually works, *then* apply it to production.

**Do not use the old approach of re-running every migration file from scratch against an already-migrated database** — confirmed live that this breaks (migration 0003 defines a view that migration 0034 later redefines with a different column set; Postgres's `CREATE OR REPLACE VIEW` can't undo that, so replaying 0003 after 0034 has already run fails with "cannot drop columns from view"). The tracking table exists specifically so this never happens — it only ever runs a given file once.

## Resetting staging's data back to a clean, known state

Two options depending on how much you want to reset:

**Just re-seed (fast, keeps the schema, replaces nothing that already matches)**:
```
cd backend/api
SUPABASE_URL=<test project URL> SUPABASE_SERVICE_ROLE_KEY=<test project service_role key> SEED_CONFIRM=yes-seed-this-database npm run seed
```
Safe to run repeatedly — it reuses existing seed records rather than duplicating them (verified: running it three times in a row produces exactly the same data each time).

**Full wipe and rebuild (only if staging data has gotten into a genuinely weird state)**: delete all rows from every table via the Supabase dashboard's Table Editor (or ask me to script it), then re-run the seed command above. There's deliberately no one-command "nuke everything" script yet — building one safely enough that it can never be pointed at the wrong project by mistake is worth its own dedicated review, not a quick addition here.

## The platform app + backend/api pointed at staging (S02-01, S02-05)

This part needs your Vercel and Render dashboard access — I can't do it myself. Concretely:

**Vercel (the platform app)**:
1. Vercel dashboard → this project → **Settings → Environment Variables**.
2. Add the test project's `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY` — but scope them to the **Preview** environment only (Vercel lets you pick Production / Preview / Development per variable), not Production.
3. Vercel already auto-deploys a **Preview** URL for every branch/PR pushed to this repo, separate from your production deployment — once the above env vars are set, any preview deployment automatically becomes a working staging environment for the platform app, with no separate service to manage.

**Render (backend/api)**:
Render's free tier doesn't give branch-based preview deployments the way Vercel does, so this needs an actual second service:
1. Render dashboard → **New → Web Service**, same repo, root directory `backend/api`.
2. Environment variables: same as production's `backend/api` service, but `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` pointed at the test project instead.
3. Give it a clearly different name (e.g. `adorworks-api-staging`) so it's never confused with production in the Render dashboard.

## Still open

- **S02-12** (required checks in branch protection) — depends on you re-adding a branch protection ruleset on `main` (you removed the only one that existed, back in Stage 1) and configuring it to require CI passing before merge. Your call whether/when.
- The Vercel/Render staging setup above — tell me once it's done and I'll verify it actually works end to end, the same way I verified the seed script and migrations.
