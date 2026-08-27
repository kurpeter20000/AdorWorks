-- AdorWorks — prevent a contract participant from approving their own
-- timesheet or rewriting submitted hours while reviewing it.
-- Run this AFTER 0030_self_service_shortlisting.sql.
--
-- The original timesheets_all policy allowed either contract participant
-- to perform every operation. Talent could therefore PATCH their own row
-- from submitted to approved. After this migration:
--   * both parties and staff may read;
--   * only the contract's talent may insert a submitted row on an active
--     contract;
--   * no authenticated user may directly update or delete a row;
--   * employer review goes through the ownership-checked Server Action,
--     whose admin client is the intentional RLS bypass.

drop policy if exists timesheets_all on timesheets;
drop policy if exists timesheets_select on timesheets;
drop policy if exists timesheets_insert_talent on timesheets;
drop policy if exists timesheets_update on timesheets;
drop policy if exists timesheets_delete on timesheets;

create policy timesheets_select on timesheets for select
  using (is_contract_participant(contract_id) or is_staff());

create policy timesheets_insert_talent on timesheets for insert
  with check (
    status = 'submitted'
    and exists (
      select 1
      from contracts c
      where c.id = contract_id
        and c.talent_id = auth.uid()
        and c.status = 'active'
    )
  );

-- NOT VALID preserves compatibility with any historic data while enforcing
-- these invariants for every new or changed row.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'timesheets_positive_hours'
      and conrelid = 'timesheets'::regclass
  ) then
    alter table timesheets
      add constraint timesheets_positive_hours check (hours > 0) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'timesheets_valid_period'
      and conrelid = 'timesheets'::regclass
  ) then
    alter table timesheets
      add constraint timesheets_valid_period check (period_end >= period_start) not valid;
  end if;
end
$$;

-- Rollback (only if application code is rolled back too):
--   drop policy timesheets_select on timesheets;
--   drop policy timesheets_insert_talent on timesheets;
--   alter table timesheets drop constraint if exists timesheets_positive_hours;
--   alter table timesheets drop constraint if exists timesheets_valid_period;
--   create policy timesheets_all on timesheets for all
--     using (is_contract_participant(contract_id) or is_staff())
--     with check (is_contract_participant(contract_id) or is_staff());
