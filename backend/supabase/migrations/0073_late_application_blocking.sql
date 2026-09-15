-- AdorWorks — S08-04: block late/closed-opportunity application inserts
-- server-side, not just via UI non-rendering + a lagging hourly cron.
--
-- Run this AFTER 0072_stage6_employer_dashboard_gaps.sql.

drop policy if exists applications_insert on applications;
create policy applications_insert on applications for insert
  with check (
    is_staff()
    or (
      talent_id = auth.uid() and source = 'applied'
      and exists (
        select 1 from opportunities o
        where o.id = applications.opportunity_id
          and o.status = 'open'
          and (o.application_deadline is null or o.application_deadline >= current_date)
      )
    )
    or (
      source = 'matched'
      and stage = 'shortlisted'
      and exists (
        select 1 from opportunities o
        where o.id = applications.opportunity_id
          and is_org_write_member(o.organisation_id)
          and o.shortlisting_mode = 'self_service'
      )
    )
  );

-- Rollback: recreate applications_insert with 0070's version (no status/
-- deadline check on the 'applied' branch).
