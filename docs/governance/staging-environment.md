# Staging environment (S02-01, S02-05, S02-08, S02-13)

Status: **Live and verified**, 2026-09-12.

- **Platform app**: `https://ador-works-git-staging-kurpeter20000s-projects.vercel.app` — auto-deploys from the dedicated `staging` branch (push to it whenever you want to update what's there).
- **Backend API**: `https://adorworks-api-staging.onrender.com` — a real second free Render service (`adorworks-api-staging`).
- Both verified with real end-to-end checks, not just "deployed successfully" — see `docs/governance/stage-02-environments-ci-and-test-data.md`'s batch 3 for exactly what was tested.

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

## The platform app + backend/api pointed at staging (S02-01, S02-05) — done

**Vercel**: production's `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SECRET_KEY` had been saved as "Secret" type since before this project (Aug 24) — turned out that locks the environment scope too, not just the type, so narrowing them to Production-only required deleting and recreating each (production's real values were recovered from the Supabase dashboard first, never from Vercel — a saved Secret can never be read back). Separate Preview-scoped entries were then added pointing at the test project, and a dedicated `staging` branch created so the preview URL is stable rather than changing per branch.

**Render**: a second free web service, `adorworks-api-staging`, root directory `backend/api`, `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` pointed at the test project, `ALLOWED_ORIGINS` set to the staging Vercel URL above.

**How this was verified** (not just "it deployed"): pushed to the `staging` branch, waited for the Vercel preview build, logged in with a seeded test account and saw the exact seeded talent/opportunity data. Separately, created a temporary staff account directly in the test database, signed in for a real token, and called the live Render staging URL's `GET /api/organisations` — got back `["Nile Youth Foundation"]`, the exact seeded organisation. Temporary account deleted immediately after.

## Still open

- **S02-12** (required checks in branch protection) — depends on you re-adding a branch protection ruleset on `main` (you removed the only one that existed, back in Stage 1) and configuring it to require CI passing before merge. Your call whether/when. Nothing else in this stage is blocked on it.
