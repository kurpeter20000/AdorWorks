-- AdorWorks — Stage 3: Service Studio full lifecycle.
--
-- 0037 (Stage 2) deliberately stopped at draft-only: talent could create,
-- edit, and delete their own draft services, with no way for a row to
-- ever leave 'draft'. This adds the rest of the lifecycle the master
-- document's own staging put in Stage 3: submit for review, staff
-- publish/reject, and talent self-service pause/resume/withdraw/revise —
-- plus making published services publicly browsable.
--
-- Run this AFTER 0041_opportunity_changes_required.sql.

alter table talent_services add column if not exists status_note text;
alter table talent_services add column if not exists published_at timestamptz;
alter table talent_services add column if not exists decided_by uuid references profiles(id);
alter table talent_services add column if not exists decided_at timestamptz;

-- Published services become visible to everyone, same precedent as
-- opportunities' "status = 'open' and visibility = 'public'" clause
-- (0002/0020) — talent_services has no separate visibility flag, so
-- 'published' alone is the signal.
drop policy if exists talent_services_select on talent_services;
create policy talent_services_select on talent_services for select
  using (talent_id = auth.uid() or is_staff() or status = 'published');

-- Widened from 0037's draft-only update policy so talent can attempt the
-- self-service transitions below; guard_talent_services_update() below is
-- what actually enforces which status changes are legal without staff.
drop policy if exists talent_services_update on talent_services;
create policy talent_services_update on talent_services for update
  using (talent_id = auth.uid() and status <> 'removed')
  with check (talent_id = auth.uid());

-- talent_services_insert, talent_services_delete (draft-only hard delete)
-- and talent_services_staff_all are unchanged from 0037.

-- Mirrors guard_opportunities_update's shape (0021/0041): talent gets a
-- specific, narrow set of self-service status transitions; everything
-- else (submitting into review is the exception — moving OUT of review,
-- i.e. actually publishing or rejecting, is staff-only) requires staff.
-- Content edits are only allowed while a row is 'draft' — once submitted,
-- the talent must use "revise" to send it back to draft first, so a
-- change is never made invisibly to a row staff is currently reviewing
-- or that's already live.
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

    if new.status = 'published' and old.status <> 'published' then
      new.published_at := now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_talent_services_update_trigger on talent_services;
create trigger guard_talent_services_update_trigger
  before update on talent_services
  for each row execute function guard_talent_services_update();

-- Rollback: drop trigger guard_talent_services_update_trigger; drop
-- function guard_talent_services_update; recreate talent_services_update
-- with 0037's draft-only using/with check; recreate talent_services_select
-- without the "or status = 'published'" clause; drop columns status_note,
-- published_at, decided_by, decided_at.
