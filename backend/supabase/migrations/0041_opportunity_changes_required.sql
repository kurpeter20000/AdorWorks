-- AdorWorks — Stage 3: a real "changes required" path for opportunities.
--
-- Today staff can only Approve or Reject a submitted opportunity. Reject
-- is terminal — there is no edit page at all, so an employer whose
-- opportunity gets rejected for something fixable (a typo, a missing
-- detail) has to recreate it from scratch. This adds a distinct
-- 'changes_required' status: staff request a specific fix with a note,
-- the employer edits and resubmits (moving it back to pending_review
-- themselves — no staff action needed for that direction), and staff
-- review it again. Reject remains available for genuinely non-fixable
-- submissions (policy violations, scams).
--
-- Run this AFTER 0040_talent_safety_orientation.sql.

alter type opportunity_status add value if not exists 'changes_required';
alter type opportunity_status add value if not exists 'paused';

-- Generic staff-note column, not named after either specific status,
-- since it's reused for both changes_required's "what needs to change"
-- and paused's "why this is paused".
alter table opportunities add column if not exists status_note text;

-- Re-declare with the same reject_unless_staff() helper as 0021 — only
-- staff can move an opportunity INTO changes_required or paused; moving
-- OUT of changes_required (the employer's resubmit) is intentionally left
-- unrestricted here, since is_org_write_member() already gates who can
-- update the row at all (0039), and a normal edit+resubmit is exactly
-- what this status exists to allow.
create or replace function guard_opportunities_update()
returns trigger language plpgsql as $$
begin
  perform reject_unless_staff(
    new.status is distinct from old.status and new.status = 'open',
    'Only staff can publish an opportunity (move it to open).'
  );
  perform reject_unless_staff(
    new.status is distinct from old.status and new.status = 'rejected',
    'Only staff can reject an opportunity.'
  );
  perform reject_unless_staff(
    new.status is distinct from old.status and new.status = 'changes_required',
    'Only staff can request changes to an opportunity.'
  );
  perform reject_unless_staff(
    new.status is distinct from old.status and new.status = 'paused',
    'Only staff can pause an opportunity.'
  );
  perform reject_unless_staff(
    new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at,
    'approved_by/approved_at are set by the approval process only.'
  );
  return new;
end;
$$;

-- Rollback: recreate guard_opportunities_update() with only the 0021
-- version's two checks (open/rejected + approved_by/approved_at); drop
-- column changes_requested_note. The two new enum values can't be
-- removed once added (a Postgres limitation, not a design choice) but
-- become simply unused if this is rolled back.
