-- AdorWorks — Phase 3: a real reject path for opportunity moderation.
--
-- Approve (POST /:id/approve) has existed since Phase 1; reject never
-- did — staff had to fall back to the generic PATCH and pick a status
-- from the six-value enum (draft/pending_review/open/filled/closed/
-- cancelled), with no dedicated action and no way to record why. Adds a
-- 'rejected' status and a reason column, mirroring how
-- organisations.verification_status already has 'rejected' +
-- risk_notes.

alter table opportunities add column if not exists rejection_reason text;

alter type opportunity_status add value if not exists 'rejected';

-- Same moderation-gate reasoning as 0008's existing 'open' guard: only
-- staff (or service_role, which is how backend/api's own staff-gated
-- routes always connect — see reject_unless_staff, 0008) can reject.
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
    new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at,
    'approved_by/approved_at are set by the approval process only.'
  );
  return new;
end;
$$;
