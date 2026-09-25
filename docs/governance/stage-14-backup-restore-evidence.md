# S14-13 evidence: backup, restore and rollback

**Status: evidence exists and is strong, but is now stale relative to
the current schema — re-running the rehearsal is the concrete next
step before this can be signed off with fresh confidence, not assumed
still valid.**

## What already happened (S03-09, S03-10 — full detail in `docs/governance/backups-and-restore.md`)

- **Daily automated backup** (`backup-production-db.yml`): live and
  working. `pg_dump` against production, `pg_restore --list`-verified
  before upload, kept 30 days as a GitHub Actions artifact. First
  successful run confirmed a real 97KB backup via the run's own
  artifacts API — not just "the workflow file exists."
- **Restore rehearsal** (`restore-rehearsal.yml`): verified end to end
  on 2026-09-13 (run #10, after five real, live-only-discoverable fixes
  documented in full in `backups-and-restore.md`) — foreign keys
  recreated and validated against the restored data with zero errors,
  real row counts confirmed. Restores into the **test project only**,
  never production, by hardcoded design — safe to re-run at will.
- **The restore mechanism is schema-agnostic by construction**, not
  hardcoded to the tables that existed on 2026-09-13: foreign key
  constraints are captured and dropped via a dynamic query against
  Postgres's own catalog (`information_schema`/`pg_constraint`), and
  every `public`-schema table has its user-defined triggers disabled/
  re-enabled in a loop (`ALTER TABLE ... DISABLE/ENABLE TRIGGER USER`),
  not a named list. Confirmed by reading `restore-rehearsal.yml`
  directly as part of this stage's work — the mechanism should still
  work correctly against today's schema without modification.

## Why "should still work" isn't the same as "verified"

27 migrations have landed since the last actual rehearsal run
(`0062` through `0088` — see `docs/governance/schema-and-ownership-map.md`'s
own update note). Several add real, non-trivial structure the
mechanism has never actually been exercised against: `risk_flags` and
`organisation_team_invitations` (new tables with their own foreign
keys), account suspension fields and the safeguarding-report RLS
restriction on `profiles`/`reports` (new guard-trigger-adjacent logic
worth confirming doesn't interact badly with a restore), and the
notification-dedupe unique index (`0085` — a restore that doesn't
respect insertion order under a unique constraint is exactly the kind
of thing that only shows up by actually running it, per the whole
history of this rehearsal's five prior fixes).

**This document does not claim the mechanism is broken** — the design
reasoning above is sound, and nothing in the newer migrations looks
like it would reintroduce any of the five specific failure modes
already fixed. But this project's own established discipline
throughout is "verify live, don't assume" — the original five fixes
were each found by actually running the rehearsal, not by reasoning
about it in advance, and treating "probably still fine" as equivalent
to "verified" would be exactly the kind of shortcut that discipline
exists to prevent.

## What's needed to close this out

1. **Re-run `restore-rehearsal.yml`** from the Actions tab (manually
   triggered, safe — targets the test project only). I don't have
   GitHub CLI/API access in this environment to trigger it myself; this
   is a founder-side click, not a code change.
2. Confirm it succeeds with zero errors, same as run #10.
3. Re-seed the test project afterward (`backups-and-restore.md`'s own
   instructions — the rehearsal overwrites it with production's data).
4. Once confirmed, this document's status line should be updated to
   reflect a fresh, current-schema-verified pass, and the tracker
   updated accordingly.

## Known, already-accepted limitations (from `backups-and-restore.md`)

- The backup lives in the same GitHub account as the code (not a fully
  separate provider) — a deliberate, accepted trade-off, not an
  oversight.
- `auth.users` (Supabase Auth's own account records) is not backed up —
  a real disaster recovery would restore every application record but
  not existing accounts' ability to log in with unchanged credentials.
- Restoring into production itself isn't built (`restore-rehearsal.yml`
  only ever targets the test project) — a genuine production restore
  would need a new, explicitly-production-scoped workflow built at the
  time, reusing the same fixes.
- Backups run once daily — up to a day of data loss in a real recovery
  scenario, which is exactly why `docs/governance/destructive-migration-policy.md`
  matters as its own, separate line of defense.

**A senior engineer's sign-off** (the tracker criterion's own wording)
is still open — this document is the evidence package for that review,
not the review itself.
