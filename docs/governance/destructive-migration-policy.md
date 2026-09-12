# Destructive migration review policy (S03-04)

Branch protection on `main` (S02-12) requires a review before any change
merges, including migration files — but it has no way to know a migration
is *destructive* specifically, so this is a deliberate, explicit checklist
for that narrower and higher-stakes case. A destructive migration is one
that can lose data or break something already live: `drop table`,
`drop column`, `truncate`, a `not null` added to a column with existing
rows, a type change that can't losslessly convert existing values, or
removing a constraint/index something else depends on.

## Before merging a destructive migration

1. **State the blast radius in the migration's own header comment** —
   which table(s), whether existing data is lost or just becomes
   unreachable, and who/what reads that data today (grep the app code,
   don't guess). This repo's migrations already do this consistently for
   non-destructive changes (see any file's opening comment) — a
   destructive one needs the same treatment plus an explicit "data loss:
   yes/no" line.
2. **Write real, executable rollback SQL in the trailing comment**, not
   prose. `docs/stage-10-security-accessibility-performance-and-controlled-release.md`
   §2 already found and partly fixed a real gap here — several older
   migrations had prose-only "rollback" comments that weren't actually
   runnable. A destructive migration without a tested rollback path is
   the one place this matters most, since the data it removes usually
   can't be reconstructed after the fact.
3. **Apply it to staging first, always** — never to production directly.
   `docs/governance/staging-environment.md` has the exact command
   (`MIGRATE_TARGET=staging ... npm run migrate`). Confirm the app still
   works end-to-end against staging after it runs, the same way every
   migration in this project has been verified live rather than assumed
   safe.
4. **A second pair of eyes before merging to `main`** — for now, that
   means the founder reviews the migration file's header comment (the
   blast-radius statement from step 1) before approving the PR/push,
   since there's no second engineer yet (`decision-log.md`,
   2026-09-12: "no separate Engineer A / Engineer B for now"). This is
   the review branch protection can't automate on its own.
5. **Apply to production only after 3 is confirmed clean and 4 is
   signed off** — same manual, deliberate step production migrations
   have always been (`apply-migrations.js`'s own top comment: "never
   point this at production without knowing exactly what you're doing").

## What counts as destructive (non-exhaustive)

- `drop table`, `drop column`
- `truncate`
- Adding `not null` to a column that already has rows (fails outright on
  any existing null, or silently coerces — check which)
- A type change that can't losslessly convert every existing value
- `drop index` / `drop constraint` where another migration or the app
  relies on it being there
- Anything using `delete from` or `update` without a `where` clause
  scoped to exactly the rows intended (the `0059` conversation-dedup
  migration is a good example of doing this *correctly* — it identifies
  and deletes only genuine duplicate rows, with the row-identification
  logic shown directly in the migration, not assumed)

## What doesn't need this checklist

Additive, reversible changes — new tables, new nullable columns, new
indexes (like `0061`), new RLS policies — follow the normal PR review
process from branch protection. This checklist exists specifically for
the harder-to-reverse category above.
