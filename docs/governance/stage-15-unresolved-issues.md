# Stage 15 — classification of all unresolved issues (S15-11)

Compiled from the decision log, threat model, schema-and-ownership map,
and this session's own direct verification (not just re-stating older
documents, several of which had drifted from actual current state —
corrected inline below where found). Grouped by who can actually
resolve each one, since that's what determines what's blocking a
release candidate versus what's a documented, accepted position.

## A — Needs the founder directly (action or a live credential only they hold)

~~Production backup~~ — **fixed and verified** 2026-09-30: founder
rotated `PROD_SUPABASE_DB_URL` to a fresh Session pooler connection
string. Confirmed live via the GitHub Actions API:
`backup-production-db.yml` succeeded at 2026-09-30 10:34 UTC — first
success after 17 days of failures on the stale secret.

~~Restore rehearsal (S14-13 sign-off)~~ — **passed and verified**
2026-09-30: founder added the second required secret
(`TEST_SUPABASE_DB_URL`, not previously flagged as needed — a gap in
the original instructions, corrected once the run surfaced it) and
manually triggered the workflow. Confirmed live via the GitHub Actions
API: `restore-rehearsal.yml` succeeded at 2026-09-30 10:33 UTC. S14-13
is genuinely satisfied now, not just attempted. **Follow-up needed**:
the rehearsal overwrites the test project's own data with a copy of
production's (by design, to prove the restore is real) — re-seed the
test project so it isn't left holding production's real application
data (`cd backend/api && SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
SEED_CONFIRM=yes-seed-this-database npm run seed`, per the workflow's
own comment).

~~UptimeRobot~~ — **verified** 2026-09-29: founder's own screenshot
showed 6 monitors, all up 16+ days, 100% uptime, covering the platform,
backend API health check, and marketing site.

~~`.env.e2e.local` credential rotation~~ — **decided** 2026-09-28:
rotate as routine hygiene, not release-blocking (test-project-only,
fails closed against production regardless). See decision log.

~~Sentry production configuration~~ — **verified live** 2026-09-28:
checked production response headers directly, real DSN active,
10% trace sampling, `vercel-production` environment confirmed.

~~No real custom domain~~ — **decided** 2026-09-28: acceptable for a
pilot; deferred to post-pilot. See decision log.

## B — Needs a role this project doesn't have yet (not substitutable)

- **Legal Counsel** — 10 of Stage 13's 14 items (S13-01/02/03/04/05/06/
  07/10/13/14) are Legal-Counsel-owned per the tracker. Drafts exist
  for the preparable ones (`data-retention-policy.md`,
  `safeguarding-procedure.md`), explicitly marked draft, not decided.
  On 2026-09-28, explicitly declined to mark these reviewed/final even
  under direct founder delegation — see decision log for the scope
  boundary decided instead (small informed pilot cohort only, real
  legal review still required before any wider launch).
- **Independent Security Reviewer** — S14-15's "independent review"
  criteria can't be fully satisfied by the same party (Claude Code)
  that did the fixing, by definition. The technical work is genuinely
  done and verified live; what's missing is a second, independent set
  of eyes, not more code. Declined to self-certify on 2026-09-28.
- **Founder + pilot-team UAT (S15-10)** — needs real people actually
  using the app, not something to build or automate. Declined to
  simulate this on 2026-09-28.

~~Support scripts and escalation contacts (S15-13)~~ — **built**
2026-09-28: `docs/governance/support-escalation-contacts.md`, founder
named as the interim contact for every category with committed SLAs;
actual email/phone left for the founder to fill in directly.

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

All items below were decided under the founder's explicit 2026-09-28
delegation ("make founder decision on my behalf... do the right
thing") — see that decision-log entry for full reasoning on each.

- ~~**Reviewer/matcher role separation (S10-01)** and **a general
  appeals workflow (S10-09)**~~ — **decided:** deferred past this
  release; not load-bearing at current pilot-team size.
- ~~**SLA targets (S10-12)**~~ — **decided:** provisional pilot-scale
  targets set (safeguarding 24h/72h, content reports 48h, verification
  5 business days, disputes 48h initial response).
- **Legal job-notice permission workflow (S07-03)** — still needs
  legal input on what the workflow should actually enforce; not
  something a policy decision alone can responsibly resolve. Still
  open.
- ~~**Two independent staff-review implementations never reconciled**
  (S07-05), opportunity-review-queue (S10-05) and staff-dashboard
  (S10-02) reconciliation~~ — **decided:** `/operations` is the
  long-term primary; `backend/api`'s staff console is legacy, kept
  live but receives no further investment. Actual retirement is a
  follow-up once `/operations` is confirmed to cover everything.
- ~~**Safeguarding reports have no single named responsible contact**~~
  — **decided:** founder is the named, accountable contact for the
  pilot phase (24h/72h SLA). RLS visibility deliberately left
  unchanged (admin-wide, per 0084) as a fail-safe — a named-
  accountability decision, not a security-scope change.
- ~~**Three-language support (English/Swahili/Arabic)**~~ — **decided:**
  reconfirmed as an explicit, documented known limitation for this
  release candidate, not silently dropped; still the founder's
  original 2026-09-12 commitment, just formally scoped as deferred
  for the pilot rather than left ambiguous.

## E — Known, narrow technical bugs (buildable, just not yet built)

None currently open — see the 2026-09-27 correction below for the one
item previously listed here.

## Corrected from stale documentation while compiling this list

- **CORS on `backend/api`** — `threat-model.md`/earlier decision-log
  entries don't mention this, but it was diagnosed and handed off to
  the founder earlier in this project (`ALLOWED_ORIGINS` on Render not
  including the production origin). Re-verified live just now with a
  real `OPTIONS` request from `https://adorworks.pages.dev`: correct
  `access-control-allow-origin` header, 204 response. **Fixed**, not
  open — noting here since nothing in the governance docs previously
  confirmed that.
- **"Stale opportunity-discovery cache"** — previously listed under
  section E as an open bug. Investigated directly rather than taken on
  faith: `/opportunities` (`platform/src/app/opportunities/page.tsx`)
  reads the session via cookies on every request, which forces Next.js
  to render it dynamically — no Full Route Cache, no cached `fetch`
  (Next 15+'s default), so every load queries Supabase live. The
  2026-09-26 e2e run's exact reproduction of this ("a published
  opportunity appears in search and disappears once closed") passed
  cleanly, not flaky, confirming there's nothing to catch here. Closing
  an opportunity's `revalidatePath` only targets the employer's own
  `/organisation/opportunities/[id]` view, not the talent-facing
  listing, but since that listing was never cached in the first place,
  that's not a bug — just scope the original call correctly had no
  need to widen. **Not reproducible**, removed from section E.
