# Stage 1 — Shared Platform Foundation Contracts

Status: first low-risk slice implemented; Stage 1 remains open for permission and operations foundations that require explicit data-model approval.

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

- `multi_role_accounts`
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

- Approve the role-assignment and organisation-permission data model.
- Implement scoped permission policies/middleware and tenant/object tests.
- Establish shared taxonomy interfaces against the existing schema.
- Add durable audit/outbox storage only after an additive migration review.
- Add an operations shell/queue foundation with route-level parity.
- Verify keyboard, screen-reader, mobile, and desktop behaviour with representative authenticated fixtures.
- Provision a disposable Supabase project before mutating E2E runs.

## Rollback

Revert the Stage 1 foundation commit. Because this slice has no migration, configuration, dependency, or persisted-data effect, rollback does not require a database operation.
