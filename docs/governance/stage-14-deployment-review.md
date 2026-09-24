# S14-17: deployment review

Self-authored, same limitation as `stage-14-architecture-review.md`
(S14-16) — not an independent review, but the evidence package for one.

## Current deployment shape

| Component | Host | Environments |
|---|---|---|
| `platform/` (Next.js) | Vercel | Production, Preview (per-branch, points at the test Supabase project), `staging` branch |
| `backend/api/` (Express) | Render | Production (`adorworks-api`) + `adorworks-api-staging` |
| `staff/` (static) | Cloudflare Pages, same deployment as the marketing site — confirmed via `_headers`' own `/staff/*` block and `render.yaml` defining only the `backend/api` service, no separate static entry | Production only |
| Marketing site | Cloudflare Pages | Production only |
| Database/Auth/Storage | Supabase | Two projects: production + a shared test/staging project (a Supabase free-plan constraint — 2 projects max per org, documented in `decision-log.md`'s 2026-09-12 entry) |
| CI | GitHub Actions | `ci.yml` (lint/test/build/Lighthouse, every push/PR), `e2e.yml` (manual trigger only — mutates the shared test/staging database), `backup-production-db.yml` (daily), `restore-rehearsal.yml` (manual trigger) |

## What this gets right

- **Free-tier-conscious design that's still real.** Staging reuses the
  test Supabase project rather than paying for a third project — a
  genuine constraint turned into a documented, accepted tradeoff
  (don't run e2e and manually review staging simultaneously), not a
  silent gap.
- **CI separates read-only checks (automatic) from database-mutating
  ones (manual trigger).** `ci.yml`'s Lighthouse job builds a fresh
  local instance with placeholder credentials — no shared state risk,
  runs on every push. `e2e.yml` is manual-only specifically because it
  touches the shared test database. This is the correct instinct: cheap,
  safe checks run automatically; expensive/risky ones require a human to
  decide the timing.
- **Backup exists and has been genuinely exercised**, not just
  configured — `backup-production-db.yml` was verified against real
  run artifacts, and `restore-rehearsal.yml`'s last full run (2026-09-13)
  found and fixed 5 real, only-discoverable-by-running-it bugs. This is
  meaningfully more than most projects at this stage have.
- **Production database credentials are handled with visibly more
  care than everything else** — `PROD_SUPABASE_DB_URL` was deliberately
  never asked for in chat, added directly as a GitHub secret by the
  founder. A real reviewer would note this as the right instinct,
  applied inconsistently (see below).

## What a real deployment review would push on

**1. The restore-rehearsal evidence is now stale relative to the
schema** (`stage-14-backup-restore-evidence.md`, S14-13, already names
this in detail — repeated here because it's a deployment-review-level
concern, not just a backup-specific one). 27 migrations have landed
since the last actual run. The mechanism's design looks sound, but "looks
sound" isn't this project's own bar — a fresh, founder-triggered run
is the concrete next step, and I cannot trigger it myself (no GitHub
CLI/API access in this environment).

**2. No staging deploy gate before production.** Both Vercel
(platform) and Render (backend/api) appear to deploy `main` directly
to production on push, based on the standing commit/push authorization
and this session's own experience pushing straight to `main` — I did
not re-verify the exact Vercel/Render project settings as part of this
review (that's a real gap in this review's own thoroughness, named
rather than glossed over). If deploys are in fact direct-to-production
with no staging soak time, that's a meaningful risk as the team grows
beyond "founder + Claude Code," even though it's a reasonable tradeoff
for the current team size and `main`'s branch-protection-with-bypass
setup.

**3. Two Supabase projects means "staging" and "the automated e2e test
database" are the same thing** — already an accepted, documented
tradeoff, but worth restating in a deployment-specific review: this
means there is no environment that is BOTH stable enough for a human
to manually review AND isolated from automated test runs. A real
production incident investigated by comparing behavior against
"staging" is implicitly also comparing against whatever state the last
e2e run left behind.

**4. `backend/api`'s service-role credential exists in at least three
places** (Render's production env, Render's staging env, and
`platform/.env.e2e.local` locally for anyone running tests) — each a
real, full-database-bypass credential. S14-08's secrets audit already
flagged the local `.env.e2e.local` file specifically as "a live,
working credential sitting in plaintext on disk," git-ignored and never
committed but still worth the founder's rotation judgment. Not a new
finding, but a deployment-review-relevant one: credential sprawl across
environments is itself a risk surface independent of any single
credential's own strength.

**5. Dependabot is active and being used correctly** (confirmed via
git history — PR #20 merged during this stage, the exact vulnerability
class this session's own `npm audit fix` also targeted) but there's no
branch-protection rule requiring CI to pass before a Dependabot PR (or
any PR) merges to `main`, per `main`'s current "bypass-enabled"
protection status documented in earlier decision-log entries. Low risk
today given the small team, worth revisiting as team size grows (S01-07/
S02-12's own already-flagged trigger).

## What this document is not

- Not independent — see the opening paragraph.
- Not a fresh audit of every Vercel/Render project setting — point 2
  above is named as an open question this review didn't fully verify,
  not asserted as fact.
- Not a recommendation to add heavyweight deployment gates at current
  team size — every observation is a "worth knowing," not a "must fix
  now."
