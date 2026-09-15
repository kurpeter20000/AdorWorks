-- AdorWorks — S06-04: enforce verified-employer capability boundaries
-- server-side.
--
-- Gap found in the Stage 6 audit (2026-09-15): organisations.verification_status
-- has only ever been used for display. Nothing actually stopped an
-- unverified (or rejected/suspended) organisation's opportunity from being
-- approved and going publicly live, and nothing stopped an unverified
-- organisation from switching an opportunity into self-service candidate
-- search. The readiness panel's own copy
-- ("Opportunities only go live once your organisation is verified",
-- platform/src/app/organisation/readiness.ts) already states this as the
-- intended rule — this migration makes the database actually enforce it,
-- regardless of which client or staff-console path makes the request.
--
-- Run this AFTER 0070_rls_drift_repair.sql.

create or replace function organisation_is_verified(org_id uuid) returns boolean
language sql stable as $$
  select exists (
    select 1 from organisations
    where id = org_id and verification_status = 'verified'
  );
$$;

-- Re-declare guard_opportunities_insert with 0043's checks intact, plus:
-- publishing an opportunity straight to 'open' at insert time (rare, but
-- possible for a staff-created row) requires a verified organisation.
create or replace function guard_opportunities_insert()
returns trigger language plpgsql as $$
begin
  perform reject_unless_staff(new.status = 'open', 'Only staff can publish an opportunity (move it to open).');
  perform reject_unless_staff(new.approved_by is not null or new.approved_at is not null, 'approved_by/approved_at are set by the approval process only.');
  if new.status = 'pending_review' and not opportunity_ready_for_review(new) then
    raise exception 'This opportunity is missing required details (category, skills, engagement type, payment basis, and a budget) — save it as a draft until it is ready to submit.' using errcode = '23514';
  end if;
  if new.status = 'open' and not organisation_is_verified(new.organisation_id) then
    raise exception 'This organisation is not verified yet — an opportunity cannot be published until verification is complete.' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Re-declare guard_opportunities_update with 0043's checks intact, plus:
-- moving an opportunity to 'open' requires a verified organisation. This
-- applies even to staff/service-role — the completeness gate above already
-- established that pattern (a content check that everyone, staff included,
-- must satisfy), and verification is the same kind of check.
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

-- Rollback: recreate guard_opportunities_insert()/guard_opportunities_update()
-- exactly as 0043 defined them; drop function organisation_is_verified.
