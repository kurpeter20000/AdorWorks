# Stage 3 — Opportunity Lifecycle, Service Studio, Role Canvas, Project Brief

Status: **implemented** (commits `7385121`, `5a81917`, `6e47e0a`). This
covers the four items the user explicitly approved for Stage 3; a formal
gap-check against the master document's full Stage 3 acceptance criteria
(the same pattern used to close out Stage 2) has not been run yet, since
this session doesn't have that document's text — see the note at the
end.

## A — Opportunity "changes required" edit/resubmit flow

Staff could previously only Approve or Reject a submitted opportunity;
Reject was terminal, with no edit path at all. `0041` adds a distinct
`changes_required` status (plus `paused`, for pulling a live listing
temporarily) and a generic `status_note` column:

- Staff: **Request changes** (with a required note) and **Pause** (with
  an optional note) actions alongside Approve/Reject, in both the staff
  console (`staff/opportunities.html`/`js`) and `backend/api`
  (`POST /:id/request-changes`, `POST /:id/pause`).
- Employer: a new `/organisation/opportunities/[id]/edit` page, shown
  when an opportunity is `changes_required`, using the same wizard as
  creation (see C below) pre-filled with the existing data. Resubmitting
  moves it back to `pending_review` — no staff action needed for that
  direction, since `guard_opportunities_update()` only gates transitions
  *into* `open`/`rejected`/`changes_required`/`paused`.
- `rejected` stays terminal by design — it's for genuinely non-fixable
  submissions (policy violations, scams); `changes_required` is the
  fixable path.

## B — Service Studio full lifecycle

Stage 2 (`0037`) deliberately stopped at draft-only. `0042` adds the
rest:

- Talent: **Submit for review** (draft → pending_review), and once
  published, self-service **Pause/Resume/Withdraw/Revise** — all gated by
  a new `guard_talent_services_update()` trigger (same shape as
  `guard_opportunities_update`) rather than by loosening RLS alone, so
  the exact set of transitions that don't need staff is enforced
  server-side, not just hidden in the UI.
- Staff: a new **Services** page in the staff console
  (`staff/services.html`/`js`) with a review queue, Publish and Reject
  (with a required reason) actions, backed by a new
  `backend/api` router (`/api/talent-services`).
- Public: `/services` — a Browse Services page, unauthenticated, listing
  `published` rows. No auth gate, same precedent as `/passport/[id]`:
  `talent_services_select`'s `status = 'published'` clause already makes
  these rows world-readable, so gating the page would only add friction.
- Content edits are only allowed while a service is `draft` — after
  submission, the talent must **Revise** (sends it back to draft) before
  editing again, so a change is never made invisibly to a row staff is
  currently reviewing or that's already live.

## C — Role Canvas wizard

Restructured the single long opportunity form (`OpportunityForm`) into a
5-step wizard — Basics, Details, Compensation, Screening & shortlisting,
Review — with no schema or server-action change. All fields stay mounted
in one `<form>` so values survive moving between steps; each step is
shown/hidden via the `hidden` attribute. Because hidden fields are exempt
from the browser's native `required` validation, a failed submission
jumps back to the first step containing a server-side field error rather
than relying on native validation to catch it before submit. Shared by
both `/organisation/opportunities/new` and the edit flow from A, since
both already used this one component.

## D — Project Brief path

A shorter, outcome-first alternative at
`/organisation/opportunities/brief` for an employer who doesn't have all
the details yet — just an outcome description, rough type/category, and
an optional rough budget. Deliberately reuses the `opportunities` table
(parked at a new-for-self-service `draft` status, which the DB already
permitted — `guard_opportunities_insert` never restricted it, only the
app code's own choice always used `pending_review` before) rather than a
separate table or pipeline, to avoid the same duplicate/unequally-complete
record problem flagged previously between the static site's old
"shortlist request" and "full brief" forms. Completing a brief reuses the
same Role Canvas wizard from C, pre-filled with what the brief already
captured — `resubmitOpportunity` now accepts opportunities in `draft` as
well as `changes_required`.

## Migrations added

Run in order, after `0040_talent_safety_orientation.sql`:

- `0041_opportunity_changes_required.sql`
- `0042_talent_services_lifecycle.sql`

Both additive, both live-verified against production via the
service-role client after the user ran them.

## Tests

Platform: 52/52. Backend: 24/24. Full production build passes with every
new route (`/services`, `/organisation/opportunities/brief`,
`/organisation/opportunities/[id]/edit`).

## Known gaps / not done in this pass

- **No genuine end-of-stage gap-check yet.** Stage 2 was closed out by
  re-reading the master document's full Stage 2 scope and finding four
  items this session had missed on the first pass. That document's text
  isn't available in this session (it was pasted directly into an
  earlier conversation, not committed to the repo) — so unlike Stage 2,
  this doc reflects only the four items the user explicitly approved via
  AskUserQuestion, not a check against the document's complete Stage 3
  section. If the document is pasted again, that check should still
  happen before calling Stage 3 done.
- **Browser verification was partial.** `tsc`/`lint`/`vitest`/`next
  build` all pass, and the new routes were spot-checked for the right
  HTTP status against the user's own running dev server (`/services` →
  200 public; the two organisation-gated routes → 307 redirect when
  unauthenticated, as expected). The actual step-by-step wizard
  interaction (Next/Back, the error-jump-back behaviour) has not been
  exercised in a browser with a real signed-in employer session.
- Project Brief's `roughBudget` only ever sets `compensation_amount`
  (never `compensation_min`/`max`) — deliberately simple for a first
  pass; the full wizard already covers ranges once someone finishes the
  brief.
