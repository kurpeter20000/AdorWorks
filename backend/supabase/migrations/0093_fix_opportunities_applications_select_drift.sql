-- AdorWorks — S14-03 RLS drift follow-up, part 2 (2026-09-25): found
-- while live-verifying 0092, not via code review.
--
-- Verifying 0092's talent_profiles_select fix against the test project
-- found the fix alone had no effect: simulating the exact scenario
-- (a non-representative org teammate reading a shortlisted self-
-- service applicant's profile) still returned zero rows. Traced it to
-- the EXISTS subquery's own dependencies — opportunities_select and
-- applications_select — which the RLS engine evaluates independently
-- for any table referenced inside another table's policy, same as a
-- top-level query against them would be.
--
-- Both were live-drifted from what 0070_rls_drift_repair.sql (their
-- own "true final version" source) actually specifies, confirmed by
-- directly reading pg_policy on the test project:
--   opportunities_select (live) used is_org_representative(organisation_id)
--   opportunities_select (0070) specifies is_org_member(organisation_id)
--   applications_select (live) used is_org_representative(o.organisation_id)
--     in a simpler using clause missing the self-service shortlisting_mode
--     branch entirely
--   applications_select (0070) specifies is_org_write_member(o.organisation_id)
--     and (applications.stage <> 'submitted' or o.shortlisting_mode = 'self_service')
--
-- No migration after 0070 touches either policy (checked directly —
-- 0078's only mention of applications_select is a design-rationale
-- comment, not a redefinition), so this isn't explained by migration
-- history. Same category of bug as 0091_fix_guard_opportunities_
-- search_path.sql: an out-of-band change applied directly to the
-- database, most likely via Supabase's dashboard, reverting both
-- policies to their pre-0070 shape. Whether this also affects staging/
-- production hasn't been checked from this session — worth a direct
-- pg_policy read there before assuming it's test-project-only.
--
-- This migration doesn't change the intended definition (0070's is
-- already correct) — it's a forced re-apply of exactly what 0070
-- specifies, the same fix pattern 0091 used for the same class of
-- problem.
--
-- Run this AFTER 0092_talent_profiles_select_write_member.sql.

drop policy if exists opportunities_select on opportunities;
create policy opportunities_select on opportunities for select
  using (
    is_org_member(organisation_id)
    or is_staff()
    or (status = 'open' and visibility = 'public')
    or has_applied_to_opportunity(opportunities.id)
    or has_invitation_for_opportunity(opportunities.id)
  );

drop policy if exists applications_select on applications;
create policy applications_select on applications for select
  using (
    talent_id = auth.uid()
    or is_staff()
    or exists (
      select 1 from opportunities o
      where o.id = applications.opportunity_id
        and is_org_write_member(o.organisation_id)
        and (applications.stage <> 'submitted' or o.shortlisting_mode = 'self_service')
    )
  );

-- Rollback: no meaningful rollback — this only re-applies migration
-- 0070's own already-committed intent; there is nothing else to
-- restore it to.
