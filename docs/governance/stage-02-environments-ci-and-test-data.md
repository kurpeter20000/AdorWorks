# Stage 2 — Environments, CI and test data

Status: **In progress.** First three batches complete. Two items remain, both needing the founder's Vercel/Render/GitHub dashboard access.

## Completion report — batch 1

| Step ID | Result | Evidence | Tests | Human review required |
|---|---|---|---|---|
| S02-09 | Complete | `backend/api/eslint.config.js` (new), `package.json`'s `lint` script, `.github/workflows/ci.yml`'s `backend-api` job now runs it | `npm run lint` clean, found and I fixed one real warning (`src/server.js`'s unused `next` in error middleware) | No |
| S02-14 | Complete | Fixed both known warnings: `backend/api/src/server.js` (unused `next` → `_next`) and `platform/src/lib/actions/assistance.ts` (removed a genuinely-unused `_prevState` param, safe because `.bind()` + `useActionState` tolerate a callback with fewer declared params) | `platform`: lint clean, `tsc`/`next build` clean, 59/59 unit tests pass. `backend/api`: lint clean, 28/28 tests pass | No |
| S02-04 | Complete | `docs/local-development-setup.md` — one walkthrough tying together the four parts' existing READMEs in the order they actually need to be set up | N/A (documentation) | No |
| S02-06 | Complete | `backend/api/scripts/seed.js` | See batch 2 below — this got fully verified once S02-07 landed | No |

## Completion report — batch 2 (a real test Supabase project now exists)

The founder created a dedicated test Supabase project (`adorworks-test`, region Europe, not connected to GitHub) specifically for this. What actually happened, in order:

| Step ID | Result | Evidence | Tests | Human review required |
|---|---|---|---|---|
| S02-07 | Complete | A real, dedicated test Supabase project exists, separate from production, with its own credentials in `platform/.env.e2e.local` (git-ignored). Its own built-in safety check (`E2E_EXPECTED_SUPABASE_PROJECT_REF`) was verified working. | All 60 migrations applied to it in order, zero errors — also a good integrity check on the migration chain itself | No |
| S02-06 (re-verified) | **Complete, genuinely this time** | Running the seed script for real (not just syntax-checking it) found **two real bugs**, both fixed: (1) `organisations.upsert(...)` used an `onConflict` column that has no unique constraint — switched to check-then-insert; (2) opportunities were inserted with `budget_min`/`budget_max`, an old column name — the actual schema (and a real check constraint, `opportunities_paid_when_open`) needs `compensation_amount`/`compensation_min`/`compensation_max`. Also added idempotency for opportunities (was missing; running it twice would have created duplicates). | Ran the script three times against the live test project: found bug 1, fixed, found bug 2, fixed, then a clean run, then a second clean run confirming nothing duplicates. Queried the database directly afterward to confirm the data is real and correct. `npm run lint` clean. | No |
| — | Bonus, not itself a tracker step | Ran the **existing end-to-end Playwright suite** (`platform/e2e/`) against the test project — this had never been executed successfully before (a prior internal review flagged it as "exists but unexecutable, no test Supabase project"). | **11 of 12 tests passed. 1 flaky** — `authorization.spec.ts`'s "a talent cannot view a contract that belongs to a different talent" timed out at 60s on the first attempt, then passed cleanly on retry. Likely a cold-start/timing issue given its heavier setup (2 users + a 5-row contract chain), not a correctness failure — the same test passed with normal timing on retry. Worth watching if it recurs, not yet something I'd call a real bug. | No, but worth knowing about |

## Completion report — batch 3 (staging environment)

Founder decision (2026-09-12): staging reuses the test Supabase project rather than a third one (free plan only allows 2 active projects — already used by production + the test project). Full detail and instructions: `docs/governance/staging-environment.md`.

| Step ID | Result | Evidence | Tests | Human review required |
|---|---|---|---|---|
| S02-08 | Complete | `backend/api/scripts/apply-migrations.js` (new) — applies only not-yet-applied migrations, tracked in a `_schema_migrations` table, instead of blindly re-running everything | Found a real bug the first version had: re-running *every* migration file unconditionally breaks, because migration 0003 defines a view that 0034 later redefines with a different column set — Postgres can't "un-add" columns via `CREATE OR REPLACE VIEW`, confirmed live. Rebuilt with the tracking table, then verified both real code paths directly: bootstrapped the test project's tracking table, confirmed a real run correctly reports "already up to date" (no attempt to replay anything), then simulated a pending migration by removing one tracking row and confirmed it applied exactly that one file and re-tracked it. `npm run lint` clean, 28/28 tests still pass. | No |
| S02-13 | Complete | `docs/governance/staging-environment.md` — how to apply new migrations to staging, how to reset its data (re-seed, or full wipe), and the Vercel/Render steps for the deploy side | N/A (documentation) | No |
| S02-01 (Vercel half) | **Complete, verified live** | Vercel env vars needed real back-and-forth to get right — the production `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SECRET_KEY` had been saved as Secret type since Aug 24 (before this project), which turned out to block editing their environment scope at all, not just their type. Fixed by deleting and recreating each as Config (the two `NEXT_PUBLIC_` ones) scoped to Production only, then adding separate Preview-scoped entries pointed at the test project. Production's real values were recovered from the Supabase dashboard first (not from Vercel, since a Secret-type variable can never be read back once saved) — nothing about production was ever at risk of being lost. | Pushed a disposable branch to trigger a real Vercel preview deployment, then logged into it with a seeded test account (`seed.talent1@example.com`). It showed "Amara Deng," "AdorVerified," and the exact seeded opportunity ("Design a new brand identity...", SSP 800) — proof the preview deployment is genuinely reading the test database, not production. Branch deleted afterward. | No |
| S02-05 (Vercel half) | Complete, verified live | Same evidence as above — a real Vercel Preview deployment now points at the test/staging database | Same as above | No |
| S02-01 / S02-05 (Render half) | Not yet done | `docs/governance/staging-environment.md`'s Render section — needs a genuine second free service (Render's free tier has no per-branch preview equivalent) | Can't test until it's created | **Yes — needs your Render access, I can't do this part myself** |

## Still open

- **S02-12** (required CI checks in branch protection) — you removed the only ruleset that existed (Stage 1). Your call whether/when to re-add one with required checks.
- **Render's half of S02-01/S02-05** — the backend/api staging service, per `docs/governance/staging-environment.md`.
