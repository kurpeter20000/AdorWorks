# Stage 15 — classification of all unresolved issues (S15-11)

Compiled from the decision log, threat model, schema-and-ownership map,
and this session's own direct verification (not just re-stating older
documents, several of which had drifted from actual current state —
corrected inline below where found). Grouped by who can actually
resolve each one, since that's what determines what's blocking a
release candidate versus what's a documented, accepted position.

## A — Needs the founder directly (action or a live credential only they hold)

- **Production backup has had zero successful runs in 13+ days**
  (`backup-production-db.yml`, failing since 2026-09-13 on a stale
  `PROD_SUPABASE_DB_URL` secret). In progress — founder is updating the
  secret from a fresh Session pooler connection string.
- **Restore rehearsal (S14-13 sign-off)** — blocked on the backup
  secret above; needs a manual trigger from the Actions tab once fixed.
- **`.env.e2e.local` credential rotation** — a real, working test-
  project credential sitting unencrypted on disk (git-ignored, never
  committed, but flagged since the original S14 audit). Founder
  judgment call, not yet decided either way.
- **Sentry/UptimeRobot production configuration status unknown from
  here** — `NEXT_PUBLIC_SENTRY_DSN` isn't set in local dev, and this
  session has no Vercel dashboard access to check whether a real DSN
  was ever set there. Worth a direct confirmation before assuming
  error monitoring is actually live in production.
- **No real custom domain secured yet** — production still runs on
  `ador-works.vercel.app` / `adorworks.pages.dev`, not a purchased
  `adorworks.*` domain. Raised earlier in this project; still true.

## B — Needs a role this project doesn't have yet (not substitutable)

- **Legal Counsel** — 10 of Stage 13's 14 items (S13-01/02/03/04/05/06/
  07/10/13/14) are Legal-Counsel-owned per the tracker. Drafts exist
  for the preparable ones (`data-retention-policy.md`,
  `safeguarding-procedure.md`), explicitly marked draft, not decided.
- **Independent Security Reviewer** — S14-15's "independent review"
  criteria can't be fully satisfied by the same party (Claude Code)
  that did the fixing, by definition. The technical work is genuinely
  done and verified live; what's missing is a second, independent set
  of eyes, not more code.
- **Founder + pilot-team UAT (S15-10)** — needs real people actually
  using the app, not something to build or automate.
- **Support scripts and escalation contacts (S15-13)** — needs real
  names/contact points for who's actually on call; a template can be
  drafted, but the content is inherently founder-supplied.

## C — Accepted, documented residual risk (a deliberate decision, not an oversight)

- **`extract-zip`'s 6 open high-severity findings** in `@lhci/cli`'s
  dependency chain — no patched version exists upstream; accepted
  given it only unpacks Chrome binaries from Google's CDN inside CI,
  never untrusted input. See the 2026-09-26 decision-log entry.
- **No malware/virus scanning on uploads** — accepted for pilot scale.
- **No anomaly-detection on staff insider activity** (e.g. a staff
  account reading unusually many profiles) — acceptable for a small,
  named pilot-scale staff team; a real gap at larger scale.
- **No application-level DDoS protection** beyond the hosting
  platforms' own baseline — acceptable for pilot scale.
- **Suspended accounts retain RLS-governed access until session
  expiry or the password-rotation-on-suspend takes effect** —
  documented in `0081_account_suspension.sql`'s own comment as a
  deliberate choice, not retrofitted schema-wide.
- **`notifications_update_owner` has no column-level guard** — a user
  could technically rewrite their own notification's title/body.
  Self-scoped only, no cross-tenant exposure; low severity, open.

## D — Real product/spec gaps (need a decision before they're buildable, not a founder-only credential issue)

- **Reviewer/matcher role separation (S10-01)** and **a general
  appeals workflow (S10-09)** — both lack a clear product spec.
- **SLA targets (S10-12)** — a policy decision, no code action to take
  until targets are actually set.
- **Legal job-notice permission workflow (S07-03)** — needs legal
  input on what the workflow should actually enforce.
- **Two independent staff-review implementations never reconciled**
  (S07-05) — the older `backend/api` staff console and the newer
  in-app `/operations` review queue both exist and both work; picking
  one and retiring the other is a real product decision with a live
  staff console at stake.
- **Opportunity-review-queue reconciliation (S10-05) and staff-
  dashboard reconciliation (S10-02)** — larger, already-flagged
  cross-implementation drifts between the staff console and the
  in-app operations views.
- **Safeguarding reports have no single named responsible contact** —
  currently every admin account receives them, the safest default
  without inventing a person; who should ultimately own this is a
  founder policy call.
- **Three-language support (English/Swahili/Arabic)** — a founder
  decision on record since early in this project (S01-02); the app is
  still English-only everywhere. Substantial, cross-cutting work with
  no dedicated tracker item of its own (closest fit: S12-15, which as
  written doesn't fully capture a 3-language requirement).

## E — Known, narrow technical bugs (buildable, just not yet built)

- **Stale opportunity-discovery cache** — `e2e/opportunity-lifecycle.spec.ts`
  found a closed opportunity still appearing in search results after
  closing and reloading. (Note: this file's *other* known failure —
  `reject_unless_staff(boolean, unknown) does not exist` — was actually
  the `guard_opportunities_update` search_path corruption fixed in
  `0091`, not a separate bug; only the stale-search-result issue is
  still genuinely open.)

## Corrected from stale documentation while compiling this list

- **CORS on `backend/api`** — `threat-model.md`/earlier decision-log
  entries don't mention this, but it was diagnosed and handed off to
  the founder earlier in this project (`ALLOWED_ORIGINS` on Render not
  including the production origin). Re-verified live just now with a
  real `OPTIONS` request from `https://adorworks.pages.dev`: correct
  `access-control-allow-origin` header, 204 response. **Fixed**, not
  open — noting here since nothing in the governance docs previously
  confirmed that.
