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
| S02-01 / S02-05 | Instructions ready, waiting on you | `docs/governance/staging-environment.md`'s last section — exact dashboard steps for both Vercel (env vars scoped to Preview, which already auto-deploys per branch — no new service needed) and Render (does need a genuine second free service, no preview-deploy equivalent on their free tier) | Can't test until you've done the dashboard steps — tell me once it's done and I'll verify it end to end | **Yes — needs your Vercel/Render access, I can't do this part myself** |

## Still open

- **S02-12** (required CI checks in branch protection) — you removed the only ruleset that existed (Stage 1). Your call whether/when to re-add one with required checks.
- **S02-01 / S02-05** — waiting on you to do the Vercel/Render dashboard steps above.
