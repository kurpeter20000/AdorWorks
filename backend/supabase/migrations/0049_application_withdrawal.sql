-- AdorWorks — Stage 5: a talent can withdraw their own application, and
-- reapply afterwards. Neither existed before this — "withdrawn" was only
-- ever a value the enum allowed, never a reachable action.
--
-- Run this AFTER 0048_saved_and_dismissed_listings.sql.

-- Talent can attempt to update their own application rows — the guard
-- trigger below is what actually restricts WHICH change is legal, same
-- split as every other "narrow self-service transition" feature in this
-- schema (opportunities, talent_services).
drop policy if exists applications_update_talent_self on applications;
create policy applications_update_talent_self on applications for update
  using (talent_id = auth.uid())
  with check (talent_id = auth.uid());

-- Re-declares the guard so the two existing non-staff update paths (the
-- employer self-service transitions from 0030/0046, and this migration's
-- new talent self-withdraw/reapply) keep working, while everything else
-- still requires staff. The 'adorworks.system_cascade' escape hatch lets
-- 0053's opportunity-closure cascade update applications regardless of
-- who/what triggered the opportunity's own status change — it's a
-- transaction-local session setting only ever set from inside that
-- trigger's own SECURITY DEFINER function, never reachable from a client
-- request, so it can't be used to bypass this guard from the outside.
create or replace function guard_applications_update()
returns trigger language plpgsql as $$
declare
  is_talent_self boolean;
  is_employer_self_service boolean;
begin
  if new.stage is distinct from old.stage then
    is_talent_self := (
      old.talent_id = auth.uid()
      and (
        (old.stage in ('submitted', 'shortlisted', 'interviewing') and new.stage = 'withdrawn')
        -- Reapplying only makes sense while the opportunity is still
        -- actually open — otherwise a stale 'submitted' row could
        -- reappear for a role that already closed, exactly the
        -- misleading-state problem 0053 exists to prevent.
        or (
          old.stage = 'withdrawn' and new.stage = 'submitted'
          and exists (select 1 from opportunities o where o.id = new.opportunity_id and o.status = 'open')
        )
      )
    );
    is_employer_self_service := (
      new.stage in ('submitted', 'shortlisted', 'rejected')
      and exists (
        select 1 from opportunities o
        where o.id = new.opportunity_id
          and is_org_write_member(o.organisation_id)
          and o.shortlisting_mode = 'self_service'
      )
    );
    if not (is_talent_self or is_employer_self_service or current_setting('adorworks.system_cascade', true) = 'true') then
      perform reject_unless_staff(true, 'Only staff can make this change to an application''s stage.');
    end if;
  end if;

  -- A talent updating their own row (the new policy above) may only ever
  -- change `stage` — block tampering with the other columns in the same
  -- request, same defense-in-depth precedent as 0043's completeness gate.
  if old.talent_id = auth.uid() then
    perform reject_unless_staff(
      new.suitability_score is distinct from old.suitability_score
      or new.notes is distinct from old.notes
      or new.decision_reason is distinct from old.decision_reason
      or new.source is distinct from old.source
      or new.created_by is distinct from old.created_by,
      'Only the application''s stage can be changed here.'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists guard_applications_update_trigger on applications;
create trigger guard_applications_update_trigger
  before update on applications
  for each row execute function guard_applications_update();

-- Rollback: drop trigger guard_applications_update_trigger; drop function
-- guard_applications_update; drop policy applications_update_talent_self.
