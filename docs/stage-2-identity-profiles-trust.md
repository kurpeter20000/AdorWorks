# Stage 2 — Identity, Profiles, Trust and Assisted Access

Status: first slice implemented (commits `fc39025`..`61b257f`). Several
items from the original Stage 2 scope remain open — see below.

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

## Explicitly not done in this slice

- **Multi-dimensional verification tracking** (separate identity/
  organisation/relationship/domain/payment/credential checks, each with
  its own status and decider) — the org side still has a single
  `verification_status` field. A real gap, deferred to a future
  continuation.
- **Free Trust & Safety orientation content** — no in-app orientation
  page or completion tracking yet.
- Maker-checker is scoped to admin/finance role assignment only, by
  explicit product decision — not generalized to talent/org verification
  decisions, which stay single-approver given team size.

## Migrations added this slice

Run in order, after `0035_audit_events.sql`:

- `0036_role_change_requests.sql`
- `0037_talent_services_foundation.sql`

Both are additive; each documents its own rollback in-file.

## Tests

Platform: 52/52 (up from 44 — added `taxonomy.test.ts` in the Stage 1
continuation and `readiness.test.ts` this slice). Backend: 24/24
unchanged. Full production build passes with the new `/passport/services`
route.
