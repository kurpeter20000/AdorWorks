# Database backups and restore (S03-09, S03-10)

**Correction (2026-09-12)**: an earlier version of this doc stated that
Supabase's free plan includes automatic daily backups. That was wrong —
confirmed directly against Supabase's own current documentation while
attempting the S03-10 restore rehearsal below, which is what surfaced the
mistake. Leaving this note rather than quietly fixing it, since the
wrong version was treated as settled fact in Stage 3's audit.

## What Supabase actually provides, by plan

- **Free plan (what both AdorWorks Supabase projects are on today)**: **no
  automatic backups at all**, and no self-serve restore. Supabase's own
  guidance for free-tier projects is to manually export data yourself
  (`pg_dump` / the Supabase CLI's `db dump`) and keep your own off-site
  copy — there is nothing built in.
- **Pro plan ($25/month for the organization, covering the first project;
  +$10/month for each additional project in the same org)**: automatic
  daily backups, 7 days of retention, self-serve restore through the
  dashboard (Database → Backups).
- **Team plan**: 14 days of retention. **Enterprise**: 30 days, plus
  point-in-time recovery (restoring to an arbitrary moment, not just a
  daily snapshot) — PITR isn't available on Pro either.

## What this means right now

**Production has zero backup protection today.** If something destructive
happened to the production database — a bad migration, an accidental
delete, a compromised credential — there is currently no built-in way to
get any of that data back. This is a real, live gap, not a theoretical
one, and it's more serious than how Stage 3 originally described it.

## The actual decision (founder's call — this costs real money)

**Option A — Upgrade the Supabase organization to Pro ($25/month)**
Gets production automatic daily backups + self-serve restore
immediately, no engineering work needed. The test/staging project could
stay on free (it holds no real user data, only seeded test data that's
already fully reproducible via `npm run seed`) — upgrading is normally
an org-wide setting, so check Supabase's billing page for exactly how it
prices "Pro org, one project actively using paid features" before
committing, since the extra-project fee structure can vary.

**Option B — Build a manual/scripted backup ourselves (no new recurring
cost)**
A scheduled job (e.g. a GitHub Action on a cron schedule) that runs
`pg_dump` against production's connection string and stores the result
somewhere durable (this would need a place to put it — a cloud storage
bucket is the normal answer, which may itself have a small cost or a
free tier depending on the provider). This is real, unbuilt engineering
work, and restoring from a plain SQL dump is a manual process we'd have
to script and rehearse ourselves rather than a dashboard click.

**Option C — Accept the risk for now, revisit before scaling past the
pilot**
Explicitly document that production is unprotected and move on, given
this is still a small, founder-supervised pilot. Reasonable only as a
conscious, written-down decision — not as something left silently
unaddressed.

## Restore rehearsal (S03-10) — blocked on the decision above

Can't be genuinely rehearsed on the free plan — there is nothing to
restore *from*, since no backup is being taken. Whichever option is
chosen above determines what this rehearsal actually looks like:

- **Option A**: once Pro is active, the original rehearsal plan applies —
  log into the Supabase dashboard for the test project (safe to
  experiment on), Database → Backups → restore the most recent one,
  verify row counts and re-run the e2e suite, re-seed if needed.
- **Option B**: once a backup script exists, rehearse restoring from an
  actual dump file into a scratch database (not production) and confirm
  the data comes back intact.
- **Option C**: nothing to rehearse — the decision itself gets logged
  instead.

## If production ever needs a restore before this is resolved

Right now, there is no path to restore lost production data beyond
whatever manual precautions exist outside this system (nothing is
known to exist). This is exactly why the destructive-migration policy
(`docs/governance/destructive-migration-policy.md`) — always test on
staging first, real rollback SQL, a second pair of eyes — matters more
than it would if a safety net already existed underneath it.
