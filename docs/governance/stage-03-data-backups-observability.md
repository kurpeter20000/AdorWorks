# Stage 3 — Data, backups and observability

Status: **12 of 12 steps complete and verified live. Stage 3 is done.**

**Correction (2026-09-12), found while attempting S03-10**: S03-09 was
originally marked "already implemented" on the belief that Supabase's
free plan includes automatic daily backups. That's wrong — confirmed
against Supabase's current docs. Free-tier projects (both of
AdorWorks's Supabase projects, including production) get no automatic
backup at all; that requires the Pro plan ($25/month+). This meant
production had zero backup protection — a real gap, not the "already
covered" status this doc previously gave it.

**Founder decision, same day**: build a free scheduled backup ourselves
rather than pay for Supabase Pro. Built and pushed:
`.github/workflows/backup-production-db.yml`, a daily GitHub Actions
job that runs `pg_dump` against production and uploads the result as a
verified workflow artifact (30-day retention). Full detail, the one
remaining setup step (a GitHub secret only the founder should add), and
restore instructions: `docs/governance/backups-and-restore.md`.

Most of this stage's ground truth was already gathered by an earlier
internal security review
(`docs/stage-10-security-accessibility-performance-and-controlled-release.md`,
2026-09-11) — its §2, §6 and §8 map almost exactly onto this stage's scope.
Rather than re-deriving it, this audit reuses that evidence and adds a
live re-check of what's changed since (the 2026-09-11 audit-logging fixes
closed part, not all, of what it flagged).

## Final status — all 12 steps complete

The table below started as the Phase A audit (original findings kept
for context) and is now updated to final status. Where the fix is
documented elsewhere in this file or in a sibling doc, that's linked
instead of repeating it.

| Step ID | What it means | Final status | Evidence |
|---|---|---|---|
| S03-01 | Publish a schema/ownership map | **Complete** | `docs/governance/schema-and-ownership-map.md` — all 49 tables, grouped by domain, with who can write to each. |
| S03-02 | Data retention/deletion rules (Founder-owned) | **Complete** | Founder decided: keep data indefinitely, staff-assisted deletion only. `docs/governance/data-retention-policy.md`. |
| S03-03 | Review indexes | **Complete** | Reviewed all 49 tables against real query patterns; found and fixed one genuine gap (`verification_events` had no index on `talent_id` despite being queried by it on every staff console talent-detail load) — migration `0061_verification_events_index.sql`, applied and verified on staging. |
| S03-04 | Require review for destructive migrations | **Complete** | `docs/governance/destructive-migration-policy.md` — a checklist for any `drop table`/`drop column`/similar change. |
| S03-05 | Complete audit events for high-risk actions | **Complete** | Closed the remaining gaps: contract creation, milestone approval/payment, dispute raised, contract cancellation, and both verification-decision endpoints now write to `audit_events`. Verified: lint/typecheck/tests clean in both `platform/` and `backend/api`. |
| S03-06 | Application error monitoring | **Complete** | Sentry wired into both `platform/` and `backend/api`; founder added both DSNs to Vercel/Render. Verified live in production via a disposable test route (real error captured, then removed). |
| S03-07 | Uptime monitoring | **Complete** | UptimeRobot — founder confirmed all three monitors (marketing site, platform app, backend API) are up. |
| S03-08 | Structured logs with correlation IDs | **Complete** | Every `backend/api` request now gets a correlation ID (`X-Request-Id`) and a structured JSON log line. Verified live against a running server. |
| S03-09 | Automated database backups | **Complete, verified live** | `.github/workflows/backup-production-db.yml` ran successfully against real production: produced a validated, real backup artifact (30-day retention). Founder chose this over Supabase Pro ($25/month+) — full reasoning in `docs/governance/backups-and-restore.md`. |
| S03-10 | Database restore rehearsal | **Complete, verified live** | `.github/workflows/restore-rehearsal.yml` ran successfully end to end (run #10, after five real fixes found only by actually attempting it — full story in `docs/governance/backups-and-restore.md`): fresh production dump restored into the test project, foreign keys recreated and validated against the restored data with zero errors, row counts confirmed. |
| S03-11 | Incident response/escalation docs | **Complete** | `docs/governance/incident-response.md` — trigger conditions and response steps; the real contact chain is left as a placeholder for the founder to fill in as the team grows. |
| S03-12 | Release rollback rehearsal | **Complete, verified live** | Rehearsed for real on the `staging` branch: pushed a disposable marker commit, confirmed via GitHub's deploy-status API that it deployed, reverted it, confirmed the revert deployed too. |

## Needs a founder decision

Three items can't proceed without you, consistent with the standing rule
that anything with a cost or an external-vendor signup gets flagged first:

- **S03-02** — a real retention/deletion policy: how long talent/employer
  data is kept, and whether account deletion is self-service or
  staff-assisted only. This is a policy call, not an engineering one.
- **S03-06** — application error monitoring needs a vendor (Sentry is the
  standard free-tier-friendly choice, but it's still a third-party signup
  that will receive application error data).
- **S03-07** — uptime monitoring needs a vendor (UptimeRobot is the usual
  free choice) polling the public health endpoints and alerting someone
  when they go down.

## Phase B — bounded batch starting now (no founder decision needed)

Everything else in the table above is either pure documentation or code
following an already-established, already-approved pattern (the same
audit-logging approach used on 2026-09-11), so I'm proceeding with these
directly under the standing build authorization:

- S03-01 — schema/ownership map
- S03-03 — index review
- S03-04 — destructive-migration review policy
- S03-05 — close the remaining audit-event gaps (contract creation,
  milestone/payment status changes, verification decisions)
- S03-08 — structured logs with correlation IDs
- S03-11 — draft the incident-response doc (contact chain left as a
  placeholder for you to fill in)
- S03-12 — rehearse a real rollback on the `staging` branch

S03-09/S03-10 turned out not to be a documentation-only item — see the
correction at the top of this doc and `docs/governance/backups-and-restore.md`
for what actually got built once the founder chose a direction.

## S03-12 — rollback rehearsal, done and verified live

Pushed a disposable, clearly-labeled marker commit (`8c91b3d`, a single
harmless `data-` attribute on the root layout) to the `staging` branch,
confirmed via GitHub's commit-status API that Vercel actually deployed it
(`"state": "success"`, `"Deployment has completed"`) — couldn't verify by
directly viewing the rendered page, since the staging URL has Vercel
Deployment Protection (SSO) enabled and returns a 302 to Vercel's login
for an unauthenticated request; the commit-status check is real proof
the deploy happened, just not a visual one. Then ran the actual rollback:
`git revert` (`fe605c5`) + push, and confirmed via the same API that the
revert also deployed successfully. This is the exact git-layer rollback
procedure documented in
`docs/stage-10-security-accessibility-performance-and-controlled-release.md`
§8 — now proven to actually work end-to-end on a real deployment, not
just documented as a plan. The temporary worktree used for this is
already cleaned up; `staging` is back to its pre-rehearsal state.

**Status**: 10 of 12 complete and verified live. S03-09 is built and
waiting on one founder step (adding a secret in GitHub, never through
chat); S03-10 follows right after — see
`docs/governance/backups-and-restore.md` for both.

## S03-06 — error monitoring (Sentry), wired and verified live

Founder created two Sentry projects (platform: Next.js, backend/api:
Node.js/Express) and provided both DSNs. Wired up:

- `platform/`: `@sentry/nextjs` 10.74.0. `src/instrumentation-client.ts`
  (client-side init — Next.js's own auto-loaded hook, required for
  Turbopack, which is this app's default bundler), `sentry.server.config.ts`,
  `sentry.edge.config.ts`, loaded via `src/instrumentation.ts`'s
  `register()`. `next.config.ts` wrapped with `withSentryConfig`. DSN
  read from `NEXT_PUBLIC_SENTRY_DSN` — unset locally/in CI, so nothing
  is sent anywhere without a real value configured. Session Replay
  deliberately not enabled (bigger privacy surface than plain error
  capture, not needed).
- `backend/api/`: `@sentry/node` 10.74.0. `instrument.mjs`, loaded via
  `node --import` (both `start` and `dev` scripts) so OpenTelemetry
  auto-instrumentation patches Express/http/pg before those modules are
  first imported. `Sentry.setupExpressErrorHandler` added before the
  existing centralized error handler, filtered to skip `ZodError` and
  any already-4xx `HttpError` — those are expected validation failures,
  not bugs, and would be pure noise. DSN read from `SENTRY_DSN`.

**Verified live, not just wired**: sent a real test exception directly
through each DSN with the actual SDK (`Sentry.captureException` +
`Sentry.flush()`), confirmed both returned a real Sentry event ID and a
successful flush. Separately booted the real backend/api server with its
production `--import` loader, hit a route that throws, and confirmed the
full pipeline — Sentry's error handler, then the existing centralized
handler — still returns the exact same JSON error shape as before
(matching `requestId` from S03-08's structured logging), so this is
additive, not a behavior change. All temporary test code (a throwaway
route, standalone test scripts, a temp local `.env`) was removed before
committing. `npm run lint`/`npm test` clean in both apps; platform's
`tsc --noEmit` and `next build` also clean.

**Still needed — founder-side, not code**: add `NEXT_PUBLIC_SENTRY_DSN`
(Vercel) and `SENTRY_DSN` (Render) as real environment variables in each
platform's dashboard — see the message accompanying this update for
exact steps. Nothing sends to Sentry in production until those are set,
by design (same "unset = no-op" safety the rest of this project's
optional integrations follow).

## S03-07 — uptime monitoring (UptimeRobot)

No code changes needed — this is entirely external, dashboard-side
configuration. Founder confirmed 2026-09-12: all three monitors visible
and up (marketing site, platform app, backend `/health`). **Complete.**

## S03-06 — production env vars confirmed live, verified end-to-end

Founder added `NEXT_PUBLIC_SENTRY_DSN` (Vercel) and `SENTRY_DSN`
(Render) as real environment variables, 2026-09-12. Verified this
actually took effect in production, not just assumed: pushed a
disposable test route (`/__sentry-wiring-test`, throws an error) to
`main`, waited for Render's real production deploy, hit it live —
got the expected `500` with a `requestId` matching the S03-08 structured
log format, confirming `SENTRY_DSN` reached the running production
process and the full error-handling pipeline (Sentry's handler ->
existing centralized handler) works exactly as designed. Removed the
route immediately after (one more commit, one more real deploy),
confirmed production is back to a clean `404` on that path and `/health`
still returns `200`. This mirrors the S03-12 rollback-rehearsal pattern,
applied to production this time with the founder's explicit go-ahead
(the auto-mode classifier flags production deploys for confirmation by
design — asked first rather than working around it).

**One thing only the founder can confirm**: whether the test event
itself (`"AdorWorks Sentry wiring test — production, to be reverted
immediately"`) actually shows up in the backend Sentry project's Issues
list — that needs eyes on the Sentry dashboard, which Claude Code
doesn't have access to. Everything on the code/infrastructure side is
confirmed working regardless.

**Status: complete** (pending that one dashboard glance, which isn't a
blocker — the mechanism is proven correct independent of it).
