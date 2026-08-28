# Stage 8 — Dashboard Frontend, Intelligence and Marketplace Health

Status: **implemented, gap-checked and corrected** (commits `34168a2`,
`d4bf56f`, `70f50d2`). Nav-shell shape (persistent top navbar vs sidebar
vs none) was a direct product decision: top navbar, chosen for being
simpler to keep responsive/low-data than a sidebar, and consistent with
the app's existing mobile-friendly card layouts.

## What this delivered

- **Persistent top navbar** (`platform/src/components/top-nav.tsx` +
  `top-nav-client.tsx`, rendered from the root layout) — on every
  authenticated page: logo/home link, a short role-curated set of links
  (distinct from the exhaustive dashboard-hub card grid, which stays as
  the full action list), a notification bell with an unread-count badge,
  account name and sign-out, and a mobile hamburger menu. Returns nothing
  on signed-out pages (login/signup/etc share the same root layout).
- **Talent Home/Today** (`/dashboard` for a talent account) — a real
  "Recommended for you" list (top 3 open opportunities ranked by overlap
  with the talent's own Passport skills, tie-broken by recency — the
  same fairness rule `/opportunities?sort=relevant` already used,
  extracted into `lib/domain/matching.ts` so both surfaces share one
  rule instead of two copies that could drift) and a "Needs your
  attention" list (offers awaiting response, milestones needing a
  resubmission, upcoming interviews) — every number a direct query
  scoped to that talent, nothing invented.
- **Employer Home/Today** — a "Hiring priorities" pipeline summary
  (applicants awaiting a decision, offers awaiting response, milestones
  ready to pay), scoped to the employer's own organisation.
- **Operations overview** (the existing staff console's `index.html` +
  `dashboard.js`) — the same 9 real marketplace-health counts as before,
  now grouped into labelled Trust queue / Workload / Marketplace health
  sections matching this stage's own language, plus genuinely
  distinguishable loading (muted "…") vs error ("!", red) tile states, a
  retry action (dashboard-wide and per-table), and a last-updated /
  manual-refresh indicator — replacing a dashboard where a stuck load
  and a failed query looked identical.

## Gap-check findings and fixes (all corrected in `70f50d2`)

An independent review against this stage's approval gate found two real
bugs and one honesty gap, all following the same pattern the gate itself
warns about — a UI confidently asserting something the data doesn't
actually support:

1. **"Applicants awaiting review" silently undercounted to zero for most
   orgs.** It counted `stage = 'submitted'` only, but `applications_select`
   RLS (0046) hides `submitted` rows from the employer entirely on a
   `staff_assisted` opportunity — today's default shortlisting mode —
   until staff move it to `shortlisted`. The widget was reading a stage
   the employer can't even see for the common case, while real
   shortlisted candidates awaiting an offer decision went uncounted.
   Fixed to count the true actionable state (`shortlisted`/`interviewing`,
   any mode) plus, for self-service opportunities specifically, the raw
   `submitted` pool the employer genuinely can see and act on.
2. **`/contracts` resolved "your org" via `organisations.representative_id`
   only**, so an invited (non-representative) team member always saw "No
   contracts yet" even though RLS would let them read their org's real
   contracts. Pre-existing, but the new "Milestones ready to pay" widget
   is the first surface that actively promises "act on this here,"
   making the broken destination newly consequential. Fixed to use
   `getMyOrganisationMembership()`, the pattern every other employer page
   already follows.
3. **No error-checking on the new Today-widget queries** — a genuine
   query failure would have rendered identically to a real "nothing
   needs your attention" / "pipeline caught up" state, undermining the
   same truthfulness the Operations dashboard fix (above) explicitly
   built for. Both dashboard branches now track query errors and show a
   "couldn't load your full picture" notice instead of confidently
   asserting an empty state on top of a failed read.

## Deliberate, honest scope choices (not gaps — decisions)

- **Operations' primary workspace stays the static staff console**, not
  a duplicate admin UI rebuilt inside the Next.js platform app. The
  console already had real marketplace-health data wired up before this
  stage; enhancing it was additive and low-risk, rebuilding it inside
  Next.js would have meant maintaining two Operations UIs for no
  functional gain.
- **No shared Card/Table/Filter component library across the whole
  existing app.** The new Stage 8 surfaces use the same bordered-card
  Tailwind conventions already established elsewhere (e.g.
  `/opportunities`), which satisfies "consistent... state language"
  without a risky retrofit of dozens of working, untouched pages.
- **Accessibility additions (aria-current, aria-expanded/controls,
  aria-label) were applied to the new nav and widgets, not retrofitted
  onto pages this stage didn't touch** — a real gap the earlier audit
  found (accessibility attributes exist in roughly 5 of 112 platform
  files), but closing it everywhere is its own pass, not bundled here.
- **The Today widgets link to existing list pages (`/offers`,
  `/contracts`, `/applications`, `/organisation`), not new filtered
  views.** A count like "3 milestones ready to pay" isn't accompanied by
  a pre-filtered destination — the employer still has to scan the list.
  Building per-state filtered views for six different counts was judged
  disproportionate to this stage's scope; noted here as a real,
  documented follow-up rather than silently left unfinished.
- **No historical trend/delta metrics** (e.g. "disputes up this week") on
  the Operations dashboard — would require a new snapshot/history table
  that doesn't exist yet, which the checklist's plain-language "trust,
  workload and marketplace-health overview" doesn't clearly demand.
  Current-state counts satisfy the requirement as written.

## Migrations added

None — this stage was entirely application-layer (Next.js + the
existing static staff console), reading and re-presenting data through
existing tables and RLS policies. No schema changes.

## Tests

Platform: 52/52. Backend: 24/24. Full production build passes.

## Known gap

The six Today-widget links (three per role) point at existing,
unfiltered list pages rather than a pre-filtered view of just the
relevant state — documented above as a scope decision, but worth
revisiting if these dashboards see real use and the extra click becomes
a genuine friction point. No independent gap-check has yet re-verified
the corrected employer pipeline count against real, populated
staff_assisted vs self_service opportunity data (this environment
currently has neither contracts nor applications to test against live).
