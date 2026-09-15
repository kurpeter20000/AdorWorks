-- AdorWorks — S07-06: allow an employer to reopen an opportunity they
-- previously closed, marked filled, cancelled, or that auto-expired —
-- no reopen path existed at all; once terminal, an opportunity had no way
-- back to 'open'. Content hasn't changed since it was last approved, so
-- this doesn't need a fresh staff review — same reasoning close/fill/
-- cancel already don't need one.
--
-- Every other guard on 'open' still applies unconditionally: the
-- completeness gate (0043) and the verified-organisation gate (0071) are
-- both outside reject_unless_staff, so a reopened opportunity still has to
-- be complete and its organisation still has to be verified.
--
-- Run this AFTER 0075_organisation_team_invitations.sql.

create or replace function guard_opportunities_update()
returns trigger language plpgsql as $$
begin
  perform reject_unless_staff(
    new.status is distinct from old.status and new.status = 'open'
      and old.status not in ('filled', 'closed', 'cancelled', 'expired'),
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
  if new.status is distinct from old.status and new.status = 'pending_review' and not opportunity_ready_for_review(new) then
    raise exception 'This opportunity is missing required details (category, skills, engagement type, payment basis, and a budget) — finish it before submitting for review.' using errcode = '23514';
  end if;
  if new.status is distinct from old.status and new.status = 'open' and not organisation_is_verified(new.organisation_id) then
    raise exception 'This organisation is not verified yet — an opportunity cannot be published until verification is complete.' using errcode = '23514';
  end if;
  if new.shortlisting_mode is distinct from old.shortlisting_mode and new.shortlisting_mode = 'self_service'
     and not organisation_is_verified(new.organisation_id) then
    raise exception 'This organisation is not verified yet — self-service candidate search is available to verified organisations only.' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Rollback: recreate guard_opportunities_update() exactly as
-- 0071_verified_employer_capability_boundaries.sql defined it (no reopen
-- carve-out).
