# S14-16: architecture review

Self-authored, not an independent senior-engineer review — the tracker
criterion this item is meant to satisfy explicitly wants an outside
perspective, which I cannot provide about my own work (same limitation
named throughout Stage 14's other documents). This is what that review
would start from: an honest description of the system's actual shape,
including the parts that would draw a real architect's questions.

## System shape

Four independently-deployed pieces sharing one Supabase project:

1. **`platform/`** — the Next.js 16 (App Router, Turbopack) app talent
   and employers use. Server Components + Server Actions as the
   primary mutation surface; RLS is the authorization boundary for the
   anon-key client, a per-Action ownership check is the boundary for
   the service-role-bypassing admin client.
2. **`backend/api/`** — an Express API, service-role Supabase client
   throughout, existing purely to back the staff console. Every route
   is its own authorization boundary (`requireAuth`/`requireStaff`/
   etc.) since RLS doesn't apply to a service-role connection.
3. **`staff/`** — a plain JS/HTML static console, zero privilege of
   its own; every privileged action round-trips through `backend/api`.
4. **The marketing site** (root-level static HTML/CSS/JS) — no
   database access at all, Cloudflare Pages-hosted.

## What this gets right

- **RLS-as-authorization is the correct default for this shape.**
  Given the anon key is genuinely public (shipped to every browser),
  putting the authorization boundary at the database layer means a
  bug in any ONE Server Action's own logic doesn't become a full data
  breach — RLS still holds regardless. Confirmed structurally sound
  this stage via a full table-by-table read (S14-03).
- **Two-tier admin-client discipline** (Server Actions' own admin
  client vs. `backend/api`'s) is intentional and named as its own
  trust boundary in the threat model, not an accident of how the code
  grew.
- **Staff console holding zero privilege of its own** is a good
  isolation property — even a fully compromised `staff/` static
  deployment (e.g., a CDN/hosting compromise) couldn't act without
  also compromising `backend/api`'s own auth.

## What a real architecture review would push on

**1. Two separate, independently-implemented "is this user allowed to
do X" systems.** RLS policies (Postgres, SQL) and `backend/api`'s
middleware (JavaScript) express overlapping authorization logic in two
different languages with no shared source of truth — the exact
condition that let S14-02's MFA gap exist (the platform app's check
lived in one place, `backend/api`'s didn't exist at all, and nothing
forced them to stay in sync). This is a structural risk, not a one-off
bug: the next role or permission added has the same chance of being
implemented in one place and forgotten in the other. No architectural
change is proposed here — a genuine fix (e.g., a shared authorization
spec both layers check against) would be a real project, not a Stage
14 patch — but a real reviewer would flag this as the system's most
consequential architectural tension.

**2. `backend/api`'s service-role client means every route is
individually responsible for least privilege**, with no database-level
backstop if a route's own check is wrong. This stage found two real
instances of exactly this failure mode (S14-02's missing MFA check,
S14-04's missing finance-role check on refunds) — not a coincidence
that both gaps were in this specific layer. Confirms rather than
introduces the concern above.

**3. Legacy/superseded structures still present.** `engagements`/
`engagement_events` are described in `schema-and-ownership-map.md` as
"the legacy pre-self-service model; still RLS-correct, just superseded
in practice by `contracts`." `talent_services`/`service_packages` have
a similar "(superseded naming for the above in early migrations)" note.
Neither is a security or correctness problem, but an architecture
review would ask whether these should be formally deprecated/removed
rather than left as parallel structures a future engineer might
mistakenly build against.

**4. No API versioning strategy on `backend/api`.** Every route is
unversioned (`/api/people`, not `/api/v1/people`) — fine for a single
first-party consumer (`staff/`) deployed in lockstep with the API, but
worth naming as a constraint if any external integration is ever
planned against this API.

**5. `talent_profiles_select`'s RLS staleness** (flagged in
`schema-and-ownership-map.md`'s "Known RLS drift" section) is a small,
concrete example of a broader pattern: RLS policies drift from their
sibling policies over time as the schema evolves in parallel, and
nothing currently catches this automatically (0070's own drift-repair
migration exists because this already happened once at larger scale).
A real review might recommend a lint-style check (e.g., a script that
flags any RLS policy referencing `is_org_member` where a sibling table
uses `is_org_write_member`) rather than relying on periodic manual
audits like this one.

## Data model observations

- 58 tables, no ORM — direct Supabase query-builder calls throughout.
  This keeps the mental model simple (what you see in a migration file
  is what exists) at the cost of no compile-time schema/query
  consistency checking beyond the hand-maintained
  `database.types.ts` — confirmed this stage that a schema change
  (widening `auth_rate_limit_attempts`' action values) required a
  manual, easy-to-forget update to that file to avoid a type error;
  nothing would have caught a forgotten update except the build
  itself failing, which it did, correctly, when I made this exact
  change.
- Polymorphic `target_type`/`target_id` pattern (`reports`,
  `risk_flags`) is a deliberate, accepted tradeoff — no real foreign
  key, staff have enough context via `target_type` + note to act
  without one, per `0083`'s own migration comment. A stricter design
  (a table per target type, or a proper polymorphic-association
  pattern with per-type FK columns) would trade this flexibility for
  referential integrity — reasonable to leave as-is for pilot scale.

## Deployment/environment shape

Covered separately in `docs/governance/stage-14-deployment-review.md`
(S14-17) — not duplicated here.

## What this document is not

- Not independent — see the opening paragraph.
- Not a redesign proposal — every observation above is named as a
  tradeoff or a risk worth a real architect's attention, not a
  recommendation to rebuild anything at pilot scale.
