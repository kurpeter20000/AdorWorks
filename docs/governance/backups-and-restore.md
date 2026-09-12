# Database backups and restore (S03-09, S03-10)

## What's already in place (S03-09) — platform-provided, not something we configure

Supabase automatically backs up every project daily, including on the
free plan, with **7 days of retention**. This isn't a script or setting
AdorWorks controls — it's inherent to the hosting, the same way Vercel
and Render's own deployment history exists without anything in this repo
configuring it.

**What free-tier backup does and doesn't cover:**
- Covers: restoring the whole database to the state it was in at the end
  of a given day, within the last 7 days.
- Doesn't cover: restoring to an arbitrary point in time within a day
  (point-in-time recovery / PITR) — that needs a paid Supabase plan. If
  something destructive happens mid-day, the daily backup can only get
  back to the *previous* day's end-of-day state, losing everything in
  between. Worth knowing before assuming a backup means "no data is ever
  really at risk."
- Applies separately to each project — production and the test/staging
  project each have their own independent daily backups.

**Where to actually restore from**: Supabase dashboard → the project →
Database → Backups. This needs the founder's own login (Claude Code
doesn't have dashboard access, only the API/DB connection strings) — see
the rehearsal steps below.

## Restore rehearsal (S03-10) — not yet performed, here's exactly how

This has never actually been tested, only assumed to work because
Supabase says it does. Given the standing "verify live, don't just
assume" approach used for everything else in this project (the seed
script, the migration runner, both staging deployments), this should
actually be rehearsed once — safely, against the test project, which
has no real user data to lose:

1. Log into the Supabase dashboard for the **test project** (the one
   `platform/.env.e2e.local` points at — project ref
   `ukftlseobdojlygyjkwj`). **Do not do this against the production
   project.**
2. Note the current state first, so the restore's effect is verifiable
   afterward — e.g. the exact row count of `talent_profiles` and
   `organisations` (Table Editor, or a quick query).
3. Database → Backups → pick the most recent daily backup → Restore.
   Supabase will walk through its own confirmation flow.
4. Once it completes, re-check the same counts from step 2, and run the
   e2e suite (`platform/e2e/`) against it — a real pass is the actual
   proof the restore left a working database, not just a database that
   "looks" restored.
5. Afterward, re-run `npm run seed` (from `backend/api/`) if the restore
   rolled back past the last seed run, so the test project ends in the
   same known-good state it was in before this rehearsal.

This needs the founder to actually click through steps 1 and 3 — flagging
it here rather than marking it done, since no restore has been performed
yet.

## If production ever actually needs a restore

Same dashboard path, on the production project instead. Given free-tier
daily-only granularity, expect to lose up to a day of data doing this —
which is exactly why steps like the destructive-migration policy
(`docs/governance/destructive-migration-policy.md`) and applying every
migration to staging first exist: to make actually needing this as rare
as possible, not to make it painless when it happens.
