# Stage 4 — Dual-Sided Discovery and Matching

Status: **implemented** (commit `071ed6f`). Scoped per two decisions the
user made up front: employer talent search stays scoped to self-service
opportunities (not an open browse-all), and reporting was built in this
pass rather than deferred.

## What this delivered

- **Employer self-service talent search** (`0046`,
  `/organisation/opportunities/[id]/find-talent`) — only reachable for an
  opportunity the employer has set to self-service shortlisting. Reuses
  the staff console's proven skill-overlap + recency ranking, with the
  same "Matches: X, Y, Z" / "shown for category fit" explanation surfaced
  to the viewer. `applications_insert` RLS widened so an org write-member
  can add a candidate directly (`source = 'matched'`, straight to
  `'shortlisted'` — no `'submitted'` reveal step, since the employer is
  choosing this themselves). `0030`'s select/update policies for this
  feature were also widened from `is_org_representative()` to
  `is_org_write_member()` (`0039`) for consistency, since they were being
  touched anyway.
- **Relevant/Recent feed for talent** (`/opportunities`) — same ranking
  rule, run against the talent's own Passport skills.
- **Reporting** (`0047`, `reports`) — spam/scam/inappropriate/misleading/
  other, reportable from opportunity listings, service listings, and
  talent profiles. New staff console Reports page + `/api/reports`.
- **Saved/dismissed parity** (`0048`) — `saved_services`/
  `dismissed_services` (services had neither before), plus
  `dismissed_opportunities` (opportunities had save but no dismiss). New
  `/services/saved` page mirrors the existing `/opportunities/saved`.
- **Pagination** on `/opportunities` (client-side — Relevant sort needs
  the whole filtered set ranked before paging) and `/services`
  (server-side range/count — no relevant-sort mode there, so a simpler
  real DB-level page works).
- **Zero-result recovery** — both browse pages now offer a "clear
  filters" path instead of a flat "no results" line.
- **Operations visibility** — three new staff dashboard tiles (open
  reports, published services, open opportunities).

## Deliberately not built

- An "invited opportunities" talent feed — the underlying employer-
  invitation feature is explicitly Stage 5's own scope ("Employer
  invitations and Talent acceptance/decline"). Building it now would mean
  starting a later stage's work early, which the playbook's guardrails
  rule out. Stage 4's talent feed is Relevant/Recent/Saved.
- Open browse-all-talent for any employer — scoped to self-service
  opportunities only, per the user's explicit choice, consistent with
  "curated shortlist stays default" from earlier stages.
- A search index (tsvector/pg_trgm/external service) — plain `ILIKE`
  continues to be adequate at current scale; revisit if/when it isn't.
- Service packages/tiers, preview screens beyond what Stage 3 already
  added, and expiry automation for services — none of these were part of
  Stage 4's own checklist.

## Migrations added

Run in order, after `0045_opportunity_expiry_automation.sql`:

- `0046_employer_self_service_talent_search.sql`
- `0047_content_reports.sql`
- `0048_saved_and_dismissed_listings.sql`

All additive; each documents its own rollback in-file.

## Tests

Platform: 52/52. Backend: 24/24. Full production build passes with every
new route (`/organisation/opportunities/[id]/find-talent`,
`/services/saved`).

## Known gap

No genuine end-of-stage gap-check against the playbook's own Stage 4
acceptance gate has been run yet (the pattern established for Stage 2 and
Stage 3) — this doc reflects the checklist read directly from the
playbook, not a second independent audit pass after implementation.
