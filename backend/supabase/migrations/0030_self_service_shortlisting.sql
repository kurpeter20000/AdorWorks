-- AdorWorks — lets an employer choose, per opportunity, whether AdorWorks
-- staff build their shortlist (today's only behaviour) or they do it
-- themselves. Chosen when the opportunity is posted; staff can still see
-- and act on either kind from the staff console.
--
-- Run this AFTER 0029_avatars_and_logos.sql.

alter table opportunities add column if not exists shortlisting_mode text
  not null default 'staff_assisted'
  check (shortlisting_mode in ('self_service', 'staff_assisted'));

-- applications_select (0002): widen the curated-shortlist branch so an org
-- rep also sees the raw 'submitted' pool when their own opportunity opted
-- into self-service shortlisting — staff_assisted opportunities keep
-- exactly today's behaviour (submitted stays hidden from the employer
-- until staff move it forward).
drop policy if exists applications_select on applications;
create policy applications_select on applications for select
  using (
    talent_id = auth.uid()
    or is_staff()
    or exists (
      select 1 from opportunities o
      where o.id = applications.opportunity_id
        and is_org_representative(o.organisation_id)
        and (applications.stage <> 'submitted' or o.shortlisting_mode = 'self_service')
    )
  );

-- New: an org rep can move their own self-service opportunity's
-- applications between submitted/shortlisted/rejected — the same three
-- stages staff themselves use for shortlisting (staff/js/opportunities.js).
-- Everything past that (interviewing/offered/accepted/withdrawn) still
-- only happens through staff or the existing offers flow, same as today,
-- so this can never be used to self-approve past the shortlist step.
drop policy if exists applications_update_employer_self_service on applications;
create policy applications_update_employer_self_service on applications for update
  using (
    exists (
      select 1 from opportunities o
      where o.id = applications.opportunity_id
        and is_org_representative(o.organisation_id)
        and o.shortlisting_mode = 'self_service'
    )
  )
  with check (
    stage in ('submitted', 'shortlisted', 'rejected')
    and exists (
      select 1 from opportunities o
      where o.id = applications.opportunity_id
        and is_org_representative(o.organisation_id)
        and o.shortlisting_mode = 'self_service'
    )
  );
