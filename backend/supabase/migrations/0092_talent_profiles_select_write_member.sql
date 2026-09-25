-- AdorWorks — S14-03 RLS drift follow-up (2026-09-25): confirmed live
-- as a real, reachable gap, not just a theoretical one.
--
-- talent_profiles_select (last touched 0070) gates the "org can see a
-- talent once shortlisted on a self-service opportunity" branch on
-- is_org_representative(o.organisation_id) — the single designated
-- representative_id on organisations, per 0002. Its sibling policies
-- (applications_select, opportunities_insert/update) were upgraded in
-- 0039 to is_org_write_member(org_id), which covers the representative
-- AND any invited teammate whose organisation_members.role isn't
-- 'viewer'. talent_profiles_select never got that upgrade.
--
-- Confirmed reachable: platform/src/app/organisation/opportunities/
-- [id]/page.tsx gates on requireOrganisationMembership() (any member,
-- not just the representative) and then selects talent_profiles with
-- the plain RLS-subject client for every applicant's talent_id. A
-- non-representative teammate (role admin/member/recruiter/
-- hiring_manager/finance) who legitimately shortlists a self-service
-- applicant gets that talent filtered out of the query entirely —
-- talentById.get(...) comes back undefined for that candidate, so
-- their name/headline render blank on a page the teammate is
-- otherwise fully authorized to use. Fails toward showing less data,
-- not more — a functional gap, not a leak, matching the severity
-- already recorded in schema-and-ownership-map.md.
--
-- Run this AFTER 0091_fix_guard_opportunities_search_path.sql.

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
        and is_org_write_member(o.organisation_id)
    )
  );

-- Rollback: recreate the policy from 0070_rls_drift_repair.sql,
-- swapping is_org_write_member(o.organisation_id) back to
-- is_org_representative(o.organisation_id).
