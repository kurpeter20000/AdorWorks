-- AdorWorks — real bug found by actually running the application/offer/
-- contract flow end to end (not just reading the RLS): talent_profiles_
-- select (0002) only ever allowed the talent themselves, staff, or a
-- profile with public_visible = true (staff-only flag, flipped after
-- full verification). Once a matcher shortlists an application, the
-- employer's opportunity-detail page (and later, their contract page)
-- try to show that talent's display_name/headline — but the employer's
-- session genuinely cannot read that row, since being shortlisted for
-- one opportunity has nothing to do with public_visible. The employer
-- saw the applicant only as "AdorWorks talent", no name, no headline —
-- the entire "review shortlisted applicants" step was non-functional.
--
-- Fix: extend talent_profiles_select with the same curated-shortlist
-- condition applications_select (0002) already uses — visible to an org
-- member once that talent has an application past 'submitted' for one
-- of the org's opportunities. Once a contract exists the application is
-- always further along than 'submitted', so this covers the contract
-- page too without a separate carve-out.
--
-- Run this AFTER 0013_reviews_for_contracts.sql.

drop policy if exists talent_profiles_select on talent_profiles;
create policy talent_profiles_select on talent_profiles for select
  using (
    id = auth.uid()
    or is_staff()
    or public_visible = true
    or exists (
      select 1 from applications a
      join opportunities o on o.id = a.opportunity_id
      where a.talent_id = talent_profiles.id
        and a.stage <> 'submitted'
        and is_org_member(o.organisation_id)
    )
  );
