-- AdorWorks — Stage 5 correction, two gaps found in gap-check:
--
-- 1. opportunities_select never granted a talent read access to an
--    opportunity they applied/were invited to once it left status='open'
--    (RLS only allowed org members, staff, or open+public rows). That
--    made 0053's whole point moot: a talent's /applications page reads
--    opportunities through the RLS-scoped client, so the cascade's
--    decision_reason banner, the real title, and the employer name all
--    silently fell back to blank/generic placeholders for exactly the
--    closed/cancelled/expired/filled/rejected opportunities the feature
--    exists to explain.
--
-- 2. close_out_stale_applications() (0053) never cascaded on 'rejected'
--    — staff's generic status editor can move an already-open
--    opportunity straight to rejected, and applications on it were
--    never closed out.
--
-- Run this AFTER 0053_application_status_truthfulness.sql.

drop policy if exists opportunities_select on opportunities;
create policy opportunities_select on opportunities for select
  using (
    is_org_member(organisation_id)
    or is_staff()
    or (status = 'open' and visibility = 'public')
    or exists (select 1 from applications a where a.opportunity_id = opportunities.id and a.talent_id = auth.uid())
    or exists (select 1 from invitations i where i.opportunity_id = opportunities.id and i.talent_id = auth.uid())
  );

create or replace function close_out_stale_applications()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status is distinct from old.status and new.status in ('closed', 'cancelled', 'expired', 'filled', 'rejected') then
    perform set_config('adorworks.system_cascade', 'true', true);
    update applications
    set stage = 'rejected',
        decision_reason = coalesce(decision_reason, 'This opportunity is no longer accepting applications.')
    where opportunity_id = new.id
      and stage in ('submitted', 'shortlisted', 'interviewing');
  end if;
  return new;
end;
$$;

-- Rollback: recreate opportunities_select without the two new exists()
-- clauses (0020's version); recreate close_out_stale_applications()
-- without 'rejected' in the IN-list (0053's version).
