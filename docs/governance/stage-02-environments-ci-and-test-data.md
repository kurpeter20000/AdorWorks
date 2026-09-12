# Stage 2 — Environments, CI and test data

Status: **In progress.** First bounded batch complete (the four items with no infrastructure/cost decision needed). Six items remain open, blocked on a real decision from the founder about provisioning a staging environment and/or a second Supabase project.

## Completion report — first batch

| Step ID | Result | Evidence | Tests | Human review required |
|---|---|---|---|---|
| S02-09 | Complete | `backend/api/eslint.config.js` (new), `package.json`'s `lint` script, `.github/workflows/ci.yml`'s `backend-api` job now runs it | `npm run lint` clean, found and I fixed one real warning (`src/server.js`'s unused `next` in error middleware) | No |
| S02-14 | Complete | Fixed both known warnings: `backend/api/src/server.js` (unused `next` → `_next`) and `platform/src/lib/actions/assistance.ts` (removed a genuinely-unused `_prevState` param, safe because `.bind()` + `useActionState` tolerate a callback with fewer declared params) | `platform`: lint clean, `tsc`/`next build` clean, 59/59 unit tests pass. `backend/api`: lint clean, 28/28 tests pass | No |
| S02-04 | Complete | `docs/local-development-setup.md` — one walkthrough tying together the four parts' existing READMEs in the order they actually need to be set up | N/A (documentation) | No |
| S02-06 | Partial | `backend/api/scripts/seed.js` — creates 2 talent profiles, 1 employer + organisation, 2 opportunities (one open, one pending review). Applications/offers/contracts deliberately not included yet. | Syntax-checked (`node --check`), lint clean, and its own safety gate (`SEED_CONFIRM=...`) verified to actually refuse running without it. **Not run against a live database** — no test Supabase project exists yet to run it against (see S02-07). Read the script's own header before trusting it. | **Yes — needs to actually be run once against a real (throwaway) Supabase project and checked before relying on it for anything.** |

## Still open, blocked on a founder decision

S02-01 (separate environments), S02-05 (staging deploy), S02-07 (disposable test database), S02-08 (automated staging migrations), S02-12 (required CI checks in branch protection), S02-13 (staging reset docs) — all depend on provisioning a staging environment and/or a dedicated test Supabase project, which has real cost and setup implications. Waiting on the founder before spinning anything up.
