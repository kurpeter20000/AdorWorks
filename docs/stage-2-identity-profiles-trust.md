# Stage 2 — Identity, Profiles, Trust and Assisted Access

Status: **complete** (commits `fc39025`..`40346e1`). An end-of-stage
review against the master document's full Stage 2 scope found four
remaining gaps (below the first slice's summary); all four were closed in
a second pass.

## What this slice delivered

- **Talent evidence viewer** — staff could approve/reject identity/
  reference/assessment evidence without ever being able to open the
  document (the file path only showed as raw text). Added the same
  signed-URL "View document" pattern already used for organisation
  registration evidence.
- **Maker-checker for admin/finance role assignment** (`0036`,
  `role_change_requests`) — promoting anyone to admin or finance now
  creates a pending request instead of applying immediately. A
  *different* admin must approve it; the API rejects self-approval.
  Scoped narrowly on purpose: every other role change stays single-step,
  since the team is small and a blanket maker-checker requirement would
  stall routine work. Staff console has a "Pending role approvals" panel
  on the People page, hidden when empty.
- **Readiness/Trust/Visibility panel** on the dashboard — three distinct,
  separately-explained signals per the master document's §19A ("never
  collapsed into one score"), computed from existing data (profile
  fields, verification tier/status, whether an opportunity's been
  posted). No new schema for this part.
- **Service Studio draft foundation** (`0037`, `talent_services`) —
  talent-authored services, distinct from the staff-curated
  `service_packages` catalogue. Deliberately draft-only: RLS only allows
  create/edit/delete of a talent's own `draft` rows. There is no
  submit-for-review action, no staff queue, and no public visibility —
  those are Stage 3 work in the master document's own staging, so this
  slice doesn't get reworked when Stage 3 arrives.

## Second pass — the four gaps found on review, now closed

- **Multi-dimensional organisation verification** (`0038`,
  `verification_checks`) — split the single `verification_status` into
  two tracked dimensions (registration, representative), each with its
  own status, `method` (formal registration vs. alternative referral/
  physical review/attestation — this is what makes SME/NGO alternative
  verification consistent and auditable instead of an undocumented
  judgment call), reason, and decision trail, including a
  request-information/appeal path for the org. `organisations.
  verification_status` is kept as a computed headline via a trigger, so
  nothing that already reads it had to change.
- **Scoped employer roles enforced, not just labelled** (`0039`) —
  recruiter/hiring_manager/finance/viewer are now selectable in the
  invite form, and `viewer` is actually blocked from posting/editing
  opportunities via a new RLS helper. Explicitly bounded: `is_org_member()`
  backs ~15 other policies (offers, applications, contracts) not touched
  here, and recruiter/hiring_manager/finance still behave like `member`
  everywhere since no functionally distinct surfaces exist for them yet.
  Documented as a known limitation, not silently claimed as complete.
- **Free Trust & Safety orientation** (`0040`) — new `/trust-safety`
  page with a one-click completion marker, linked from the dashboard and
  folded into the readiness panel's missing-items list. Never gated
  behind a plan or fee.
- Maker-checker stays scoped to admin/finance role assignment only, by
  explicit product decision — not generalized to talent/org verification
  decisions, which stay single-approver given team size. (Confirmed
  intentional, not reopened as a gap.)

## Migrations added across both passes

Run in order, after `0035_audit_events.sql`:

- `0036_role_change_requests.sql`
- `0037_talent_services_foundation.sql`
- `0038_organisation_verification_checks.sql`
- `0039_org_viewer_role_enforcement.sql`
- `0040_talent_safety_orientation.sql`

All additive; each documents its own rollback in-file.

## Tests

Platform: 52/52. Backend: 24/24. Full production build passes with every
new route (`/passport/services`, `/trust-safety`).
