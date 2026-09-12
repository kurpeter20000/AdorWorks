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

## Restoring from a backup (rehearse this against the test project, never production)

1. Download the artifact from the Actions run (a `.zip` containing the
   `.dump` file) and unzip it.
2. Get the **target** database's connection string — for a rehearsal,
   the test project's (never production's, unless this is a real
   disaster recovery).
3. Restore:
   ```
   pg_restore --clean --if-exists --no-owner --no-acl --dbname="<target connection string>" adorworks-production-<timestamp>.dump
   ```
   `--no-owner --no-acl` matters here since the dump's original
   ownership/grants belong to the production project specifically and
   won't resolve correctly against a different project. `--clean
   --if-exists` drops existing objects first so the restore doesn't
   fail on "already exists" conflicts.
4. Verify: check row counts on a few key tables, and ideally run the
   e2e suite (`platform/e2e/`) against the restored database to confirm
   it's not just present but actually working.

**S03-10 status**: rehearsal not yet performed — needs the founder to
add the `PROD_SUPABASE_DB_URL` secret first (nothing to restore from
until a backup has actually run), then either wait for the first
scheduled run or trigger one manually, then walk through the restore
steps above against the test project.

## If production ever needs a real restore

Same restore command as above, pointed at production's own connection
string instead of the test project's — but only after exhausting the
faster options first: Vercel/Render's own one-click deployment rollback
for anything code-level, and confirming the issue is actually data loss,
not something else. A full database restore is a last resort, and per
Supabase's normal daily-granularity limits (this backup runs once a
day too), expect to lose up to a day of data doing it — exactly why the
destructive-migration policy (`docs/governance/destructive-migration-policy.md`)
matters as much as the backup itself.
