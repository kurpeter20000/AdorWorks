-- AdorWorks — corrects a bug in 0014's own fix, found by re-running the
-- exact same live walkthrough that found the original problem: it still
-- failed at the identical assertion after 0014 was applied.
--
-- 0014 added a curated-shortlist branch to talent_profiles_select using
-- is_org_member(o.organisation_id) — but that function checks the
-- organisation_members table, and organisations created through the
-- self-service flow (platform/src/lib/actions/organisation.ts,
-- createOrganisation) only ever set organisations.representative_id;
-- they never insert a matching organisation_members row (0005's backfill
-- only covered organisations that already existed at that migration).
-- So is_org_member() was always false for exactly the orgs this was
-- meant to help, and the bug 0014 was supposed to fix was still there.
--
-- applications_select (0002) — the policy 0014 says it's mirroring —
-- actually uses is_org_representative(o.organisation_id), not
-- is_org_member(). This migration corrects 0014 to use the same
-- function it was always supposed to, matching applications_select
-- exactly rather than just resembling it.
--
-- Run this AFTER 0014_talent_visible_once_shortlisted.sql.

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
        and is_org_representative(o.organisation_id)
    )
  );
