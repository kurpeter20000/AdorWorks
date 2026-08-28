-- AdorWorks — Stage 3 correction: server-enforced completeness gate.
--
-- Gap found reviewing Stage 3 against the formal playbook: nothing at the
-- database layer stopped an incomplete opportunity or talent_service from
-- reaching 'pending_review' (and, once approved, public visibility) — the
-- app's own forms validate thoroughly (see OpportunitySchema/ServiceSchema),
-- but that's the sanctioned UI path only. Anyone calling the Supabase
-- client directly with their own session could bypass it entirely, since
-- RLS/the existing guard triggers only ever checked WHO could change
-- status, never WHETHER the row had enough content to be reviewable. This
-- adds that check to the triggers themselves, so it holds regardless of
-- which client makes the request.
--
-- Run this AFTER 0042_talent_services_lifecycle.sql.

-- Budget can be expressed either through the newer compensation_* columns
-- (the self-service employer form) or the original budget_min/budget_max
-- columns from 0001 (still what the staff console's own create form
-- writes) — this accepts either, rather than forcing one representation.
create or replace function opportunity_ready_for_review(o opportunities) returns boolean
language sql immutable as $$
  select o.title is not null and length(trim(o.title)) > 0
    and o.category is not null
    and o.skills is not null and array_length(o.skills, 1) > 0
    and o.engagement_type is not null
    and o.payment_basis is not null
    and (
      coalesce(o.compensation_amount, 0) > 0 or coalesce(o.compensation_min, 0) > 0 or coalesce(o.compensation_max, 0) > 0
      or coalesce(o.budget_min, 0) > 0 or coalesce(o.budget_max, 0) > 0
    );
$$;

create or replace function service_ready_for_review(s talent_services) returns boolean
language sql immutable as $$
  select s.title is not null and length(trim(s.title)) > 0
    and s.category is not null
    and s.deliverables is not null and length(trim(s.deliverables)) > 0
    and s.payment_basis is not null
    and s.price is not null and s.price > 0;
$$;

-- Re-declare with 0010's two original checks intact, plus the new gate —
-- this covers a project brief (0044) or any other row inserted directly
-- as 'pending_review'. Drafts are exempt on purpose: that's the whole
-- point of a draft.
create or replace function guard_opportunities_insert()
returns trigger language plpgsql as $$
begin
  perform reject_unless_staff(new.status = 'open', 'Only staff can publish an opportunity (move it to open).');
  perform reject_unless_staff(new.approved_by is not null or new.approved_at is not null, 'approved_by/approved_at are set by the approval process only.');
  if new.status = 'pending_review' and not opportunity_ready_for_review(new) then
    raise exception 'This opportunity is missing required details (category, skills, engagement type, payment basis, and a budget) — save it as a draft until it is ready to submit.' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Re-declare with all of 0041's checks intact, plus the new gate on any
-- transition INTO pending_review (covers both resubmitOpportunity and a
-- direct client update).
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
  return new;
end;
$$;

-- Re-declare with all of 0042's checks intact, plus the new gate. There is
-- no talent_services insert guard to update — 0037's insert policy already
-- forces every inserted row to status = 'draft', so 'pending_review' can
-- only ever be reached via this update trigger.
create or replace function guard_talent_services_update()
returns trigger language plpgsql as $$
declare
  content_changed boolean;
begin
  content_changed := (
    new.title is distinct from old.title or
    new.category is distinct from old.category or
    new.problem_solved is distinct from old.problem_solved or
    new.deliverables is distinct from old.deliverables or
    new.exclusions is distinct from old.exclusions or
    new.payment_basis is distinct from old.payment_basis or
    new.price is distinct from old.price or
    new.currency is distinct from old.currency or
    new.turnaround is distinct from old.turnaround
  );
  perform reject_unless_staff(
    content_changed and old.status <> 'draft',
    'This service can only be edited while it''s a draft — use Revise to send it back to draft first.'
  );

  if new.status is distinct from old.status then
    if not (
      (old.status = 'draft' and new.status = 'pending_review')
      or (old.status in ('rejected', 'published', 'paused') and new.status = 'draft')
      or (old.status = 'published' and new.status = 'paused')
      or (old.status = 'paused' and new.status = 'published')
      or (old.status <> 'removed' and new.status = 'removed')
    ) then
      perform reject_unless_staff(true, 'Only staff can make this change to a service''s status.');
    end if;

    if new.status = 'pending_review' and not service_ready_for_review(new) then
      raise exception 'This service is missing required details (category, deliverables, and price) — finish it before submitting for review.' using errcode = '23514';
    end if;

    if new.status = 'published' and old.status <> 'published' then
      new.published_at := now();
    end if;
  end if;

  return new;
end;
$$;

-- Rollback: recreate guard_opportunities_insert() with only 0010's two
-- checks; recreate guard_opportunities_update() with only 0041's checks;
-- recreate guard_talent_services_update() with only 0042's checks; drop
-- functions opportunity_ready_for_review and service_ready_for_review.
