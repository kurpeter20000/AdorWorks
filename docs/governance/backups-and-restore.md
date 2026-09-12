# Database backups and restore (S03-09, S03-10)

**Correction (2026-09-12)**: an earlier version of this doc stated that
Supabase's free plan includes automatic daily backups. That was wrong —
confirmed directly against Supabase's own current documentation while
attempting the S03-10 restore rehearsal, which is what surfaced the
mistake. Leaving this note rather than quietly fixing it, since the
wrong version was treated as settled fact in Stage 3's audit.

## What Supabase actually provides, by plan

- **Free plan (what both AdorWorks Supabase projects are on)**: **no
  automatic backups at all**, and no self-serve restore. Supabase's own
  guidance for free-tier projects is to export data yourself and keep
  your own off-site copy — nothing is built in.
- **Pro plan ($25/month for the org, covering the first project;
  +$10/month per additional project)**: automatic daily backups, 7 days
  of retention, self-serve restore through the dashboard.

## Founder decision, 2026-09-12: build our own free backup instead of upgrading

Rather than pay for Supabase Pro, AdorWorks backs up production itself:
a scheduled GitHub Actions workflow
(`.github/workflows/backup-production-db.yml`) runs `pg_dump` against
production daily and stores the result as a workflow artifact, kept for
30 days (longer than Pro's own 7-day window, since a small pilot
database's dumps are tiny relative to GitHub's free storage quota).

**Known limitation, accepted deliberately**: this keeps the backup in
the same GitHub account as the code itself, rather than a fully separate
provider — a real (if unlikely) single-point-of-failure if the GitHub
account were ever compromised or suspended. Moving the backup to
somewhere like Cloudflare R2 (AdorWorks already has a Cloudflare
account for the marketing site, and R2's free tier is generous) would
close that gap without paying Supabase Pro either — worth revisiting
if this pilot grows, not a blocker for shipping this now.

## One-time setup needed — founder's side, not code

The workflow needs a GitHub repository secret it doesn't have yet:

1. Get production's direct database connection string: Supabase
   dashboard → the **production** project → Project Settings → Database
   → Connection string (the `postgresql://postgres:...@db....supabase.co:5432/postgres`
   one, not the API URL).
2. In GitHub: this repo → Settings → Secrets and variables → Actions →
   **New repository secret**.
3. Name: `PROD_SUPABASE_DB_URL`. Value: the connection string from step 1.
4. Save.

**Never paste that value into a chat with Claude Code, or into any file
that gets committed** — it's a full-access production database
credential, unlike the DSNs or anon keys used elsewhere in this project.
Adding it directly through GitHub's own secret UI is the only place it
should ever go.

Once the secret exists, the workflow runs automatically every day at
02:00 UTC. You can also trigger it immediately without waiting: this
repo's **Actions** tab → "Backup production database" → **Run workflow**.

## How to verify a backup actually worked

After a run (scheduled or manual): Actions tab → the run → its
**Artifacts** section should show a file named
`adorworks-production-<timestamp>.dump`, a few KB to a few MB depending
on how much real data exists. The workflow already runs `pg_restore
--list` on it before uploading, so if the run shows green, the dump is
confirmed to be a valid, readable archive — not just a file that exists.

## Restoring from a backup — S03-10, done and verified live

`.github/workflows/restore-rehearsal.yml` (manually triggered only, via
the Actions tab) does the whole thing automatically: takes a fresh
production dump and restores it into the **test project**, verified
successful end to end on 2026-09-13 (run #10) — foreign keys recreated
and validated against the restored data with zero errors, real row
counts confirmed. Nothing manual needed for a rehearsal; just run that
workflow.

**Getting here took five real, live-only-discoverable fixes** (each one
found by actually attempting the restore, not by reasoning about it in
advance — worth recording, since the naive approach anyone would
reach for first doesn't work against Supabase specifically):

1. A full pg_dump also captures Supabase's own platform-managed schemas
   (`auth`, `storage`, `extensions`, `realtime`, etc.), which already
   exist — differently — in any other Supabase project. Restoring them
   collides badly (575 errors). **Fix**: `pg_dump --schema=public` only.
2. Even scoped to `public`, pg_dump still captures database-wide event
   triggers; one (`extensions.pgrst_drop_watch`, PostgREST's own
   schema-cache-invalidation trigger) is owned by a superuser in
   production, and the restoring role is never a superuser in any
   Supabase project (687 errors). **Fix**: since AdorWorks's schema is
   already fully reproducible from `backend/supabase/migrations/`
   (applied identically to every environment), a backup only ever needs
   to carry **data**, never schema — `pg_dump --data-only`.
3. `pg_restore --disable-triggers` needs superuser to disable Postgres's
   own internal foreign-key-check triggers, which Supabase's connection
   role deliberately isn't (115 errors, `RI_ConstraintTrigger_... is a
   system trigger`). **Fix**: capture every `public`-schema foreign key's
   definition, drop them all first (normal owner-level DDL, no special
   privilege needed), restore data in any order, then recreate every
   constraint — which validates the data at that point, once everything
   is present.
4. This schema's own business-rule guard triggers (e.g.
   `guard_talent_profiles_insert`, which blocks a non-staff session from
   setting a verification tier directly) fired during the restore and
   rejected already-valid, already-committed production rows (4 errors)
   — they exist to protect the live app from invalid writes, not to
   re-validate a restore. **Fix**: `ALTER TABLE ... DISABLE/ENABLE
   TRIGGER USER` around the data load — this only touches regular
   user-defined triggers, never the protected system ones, so (like the
   FK fix above) it needs no special privilege either.
5. A data-only restore doesn't remove existing rows on its own, so every
   `public` table is explicitly truncated first — otherwise a second run
   would collide with the first run's data on primary keys.

**Known, accepted limitation**: none of this backs up `auth.users`
(Supabase Auth's own account records — emails, password hashes).
Restoring that across projects is meaningfully riskier still (tied to
each project's own Auth service internals), and free-tier Supabase has
no backup of that layer regardless. A real disaster recovery would
still recover every application record (profiles, contracts, payments,
etc.), just not existing accounts' ability to log back in with
unchanged credentials. Worth revisiting deliberately later.

**After running a rehearsal**: the test project's `public` tables now
hold a copy of production's data, not the known seed state — re-seed it
back:
```
cd backend/api
SUPABASE_URL=<test project URL> SUPABASE_SERVICE_ROLE_KEY=<test project service_role key> SEED_CONFIRM=yes-seed-this-database npm run seed
```

## If production ever needs a real restore

The same `restore-rehearsal.yml` steps apply, but pointed at production
instead of the test project as the *target* — which this workflow
doesn't currently support directly (it's hardcoded to restore into
`TEST_SUPABASE_DB_URL` specifically, deliberately, so an accidental
trigger can never touch production). A genuine disaster-recovery restore
would need a new, explicitly-production-scoped workflow built at the
time, reusing these exact same fixes. Exhaust faster options first
either way: Vercel/Render's own one-click deployment rollback for
anything code-level, and confirm the issue is actually data loss, not
something else. A full database restore is a last resort, and since this
backup runs once a day, expect to lose up to a day of data doing it —
exactly why the destructive-migration policy
(`docs/governance/destructive-migration-policy.md`) matters as much as
the backup itself.
