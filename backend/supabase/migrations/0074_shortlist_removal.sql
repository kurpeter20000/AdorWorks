-- AdorWorks — S06-10: allow an employer to remove a candidate they added
-- themselves via self-service search from their shortlist. Scoped narrowly
-- to rows the employer added (source = 'matched') on their own
-- organisation's opportunity — a real applicant's own submission
-- (source = 'applied') can never be deleted this way; "reject" is the
-- correct action for those and already exists.
--
-- Run this AFTER 0073_late_application_blocking.sql.

drop policy if exists applications_delete_employer_shortlist on applications;
create policy applications_delete_employer_shortlist on applications for delete
  using (
    source = 'matched'
    and stage = 'shortlisted'
    and exists (
      select 1 from opportunities o
      where o.id = applications.opportunity_id
        and is_org_write_member(o.organisation_id)
    )
  );

-- Rollback: drop policy applications_delete_employer_shortlist.
