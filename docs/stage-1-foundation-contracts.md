# Stage 1 — Shared Platform Foundation Contracts

Status: first low-risk slice implemented (this document's original content
below); a second continuation slice closed several of the "remaining
gates" listed at the bottom. Stage 1 remains open for the items still
marked open there.

## Continuation slice (commits `a10b0e2`..`a280407`)

- **Organisation role scopes (schema readiness only)** — `0033` additively
  widens `organisation_members.role`'s check constraint to allow
  `recruiter`/`hiring_manager`/`finance`/`viewer` alongside the existing
  `member`/`admin`. No application code writes a new value yet;
  enforcement is still a later stage's job. Multi-role *accounts* (one
  identity holding both a Talent and Employer profile) were explicitly
  ruled out as a product direction and are not part of this or any
  planned stage.
- **Public Passport safe projection** — `0034` catches the
  `public_talent_profiles` view up to the columns the public page
  actually renders (it predated avatar/display-name/bio/social links),
  and the page now reads the view instead of `talent_profiles.select("*")`.
- **Durable audit foundation** — `0035` adds `audit_events` (same
  no-insert-policy-for-regular-users pattern as `verification_events`/
  `engagement_events`/`assisted_field_changes`). `logAuditEvent()` exists
  in both the platform app (`lib/domain/audit.ts`) and `backend/api`
  (`src/audit.js`, kept in sync by hand across the two runtimes), wired
  into the People page's two staff role-change endpoints. The staff
  console's People page has a new read-only "Recent audit events" panel.
  This is a first working slice, not a complete activity log — most
  events in `domain/events.ts`'s vocabulary still don't emit anything yet.
- **Fixed a Stage 0 highest-priority finding**: `inviteTeamMember` no
  longer overwrites an existing account's `profiles.role` — only a
  brand-new account gets one assigned. `getMyOrganisationMembership` now
  checks `organisation_members` first regardless of role, falling back to
  the `CLIENT_ROLES` gate only when there's no membership at all, so an
  existing account invited to a team can actually use that membership
  instead of being locked out by the fix above.
- **Shared taxonomy module** — `lib/domain/taxonomy.ts` consolidates
  category/engagement-type/work-mode/payment-basis labels for new code;
  existing duplicated maps in `opportunities/page.tsx` and the opportunity
  form are untouched, same precedent as `domain/states.ts`.

Not done in this slice, still open: the disposable Supabase project for
mutating E2E, and a full accessibility audit (the new UI added here
follows existing table/status-role patterns but wasn't independently
audited beyond that).

## Contracts established

- `platform/src/lib/domain/roles.ts` is the runtime catalogue for every current database role and its dashboard grouping.
- `platform/src/lib/domain/navigation.ts` defines role-specific dashboard destinations, including organisation members/admins and onboarding agents.
- `platform/src/lib/domain/states.ts` is the authoritative user-facing label/tone map for current opportunity, application, offer, contract, milestone, and organisation-verification states.
- `platform/src/lib/domain/events.ts` fixes stable event names and the future audit/outbox envelope. Defining names does not imply events are durably emitted yet.
- `platform/src/lib/domain/featureFlags.ts` defines material capabilities as server-evaluated and off by default.
- `StatusBadge` and `StatePanel` provide small shared status, loading, success, denied, empty, and error primitives using the existing palette.
- The authenticated dashboard now renders from the role/navigation contract instead of local role conditionals.
- Existing application, opportunity, offer, contract, and milestone screens consume shared state definitions.

## Feature-flag convention

Each material flag uses `ADORWORKS_FF_<UPPERCASE_FLAG_NAME>`. Accepted true values are `1`, `true`, `yes`, and `on`; absent or ambiguous values are false. Flags are evaluated on the server and are not an authorization boundary.

Initial material flags:

- `multi_role_accounts` — ruled out as a product direction (talent accounts do not switch to become employers); kept only as a defined-but-unused name, not a planned build
- `service_marketplace`
- `explainable_matching`
- `structured_hiring`
- `profile_video`
- `real_payments`
- `operations_v2`
- `public_marketplace`

## Public-site information architecture contract

The current static routes and conversion forms remain authoritative through Stage 9. Product capability must not be advertised before the corresponding authenticated journey, fee/trust policy, and operations support are real. Content owners must replace all `Content pending` legal/contact details before a custom-domain launch. Route redirects, canonical URLs, sitemap entries, and PWA cache versioning must be updated together when public routes change.

## Security and data impact

- No schema, RLS policy, API, storage, authentication-provider, dependency, or environment change.
- No production data read or write.
- Existing route authorization remains in force; hidden navigation never grants access.
- Staff and partner workflows remain on their existing surfaces rather than linking users to unfinished replacements.
- The central role groups remove local drift but intentionally preserve current broad permissions until policy migrations and isolation tests are approved.

## Stage 1 remaining gates

- Approve the role-assignment and organisation-permission data model. **Partially done**: `organisation_members.role` has room for new scopes (`0033`); enforcement policies/middleware are not built yet.
- Implement scoped permission policies/middleware and tenant/object tests. Still open.
- ~~Establish shared taxonomy interfaces against the existing schema.~~ Done — `lib/domain/taxonomy.ts`.
- ~~Add durable audit/outbox storage only after an additive migration review.~~ Done — `0035`/`audit_events`, first two call sites wired.
- Add an operations shell/queue foundation with route-level parity. **Partially done**: a read-only audit-log panel exists on the staff People page; no broader shell/queue rework.
- Verify keyboard, screen-reader, mobile, and desktop behaviour with representative authenticated fixtures. Still open — the new UI follows existing patterns but wasn't independently audited.
- Provision a disposable Supabase project before mutating E2E runs. Still open — needs a human to create the project; not something either agent could do unilaterally.

## Rollback

**Original slice** (contracts only): revert the commit. No migration, configuration, dependency, or persisted-data effect.

**Continuation slice** (`0033`–`0035`): each migration documents its own rollback in its own file. In order: drop `audit_events`; restore the original two-column-value `organisation_members` check constraint (safe only if nothing has written a new-scope value yet); recreate `public_talent_profiles` with only its original 0003 column list (safe only if nothing depends on the added columns). The `inviteTeamMember`/`getMyOrganisationMembership` code changes have no persisted-data effect and revert with a plain commit revert.
