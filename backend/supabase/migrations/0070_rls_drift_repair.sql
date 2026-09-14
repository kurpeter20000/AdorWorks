-- AdorWorks — RLS drift repair, found during Stage 8's live re-verification
-- of its own "Known gap" (the employer applicant-pipeline count against
-- real staff_assisted/self_service data).
--
-- A live end-to-end test of that exact fix (0046) came back wrong: a
-- self-service opportunity's 'submitted' application was invisible to the
-- employer even though 0046's applications_select is explicitly written to
-- allow it. Direct inspection of the live database's actual RLS policy text
-- (pg_policies) confirmed applications_select was still word-for-word the
-- ORIGINAL 0002 version, not 0046's — despite _schema_migrations recording
-- 0046 (and every migration after it) as applied.
--
-- A full scan comparing every migration file's LAST intended definition of
-- every policy against the live database found this wasn't isolated: 12
-- policies across 8 files (0013, 0015, 0020, 0024, 0026, 0039, 0046, 0060)
-- are stuck at an earlier version, even though the newer helper functions
-- these policies were supposed to start using (is_org_member,
-- is_org_write_member, is_contract_participant, has_applied_to_opportunity,
-- has_invitation_for_opportunity) all correctly exist live — only the
-- DROP POLICY/CREATE POLICY statements themselves never actually took
-- effect, in every one of these 12 cases specifically. The most likely
-- explanation: the 2026-09-14 test-project tracking-table-wipe incident's
-- reconciliation (see decision-log.md) verified "the actual schema was
-- intact through migration 0060" by spot-checking specific tables/indexes/
-- functions, not by diffing every individual policy's exact text — missing
-- that these 12 policies were frozen at a pre-restore snapshot while
-- everything else (including the newer functions) was already caught up.
--
-- Every case follows the same shape: the live policy is MORE restrictive
-- than intended (missing an OR-branch that grants access), not less — this
-- is a functionality bug (legitimate users wrongly blocked), not a security
-- hole. Re-applying each policy's true final text, verbatim from its
-- source-of-truth file, below. Every statement is a plain
-- "drop policy if exists ... create policy ..." — idempotent and safe to
-- run regardless of which of these 12 (if any) were secretly already
-- correct.
--
-- This is a staging/test-project finding — production's migration history
-- runs through the normal CI pipeline and was never touched by the
-- tracking-table incident this traces back to, but the founder should
-- independently confirm production's live policy text matches these same
-- 8 files before assuming it's unaffected.
--
-- Run this AFTER 0069_talent_evidence_bucket_hardening.sql.

-- talent_profiles_select — true final version: 0015_fix_talent_visibility_helper.sql
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

-- organisations_select — true final version: 0020_fix_organisations_rls_for_team_members.sql
drop policy if exists organisations_select on organisations;
create policy organisations_select on organisations for select
  using (representative_id = auth.uid() or is_staff() or is_org_member(id));

-- opportunities_select — true final version: 0060_fix_opportunities_rls_recursion.sql
drop policy if exists opportunities_select on opportunities;
create policy opportunities_select on opportunities for select
  using (
    is_org_member(organisation_id)
    or is_staff()
    or (status = 'open' and visibility = 'public')
    or has_applied_to_opportunity(opportunities.id)
    or has_invitation_for_opportunity(opportunities.id)
  );

-- opportunities_insert / opportunities_update — true final version: 0039_org_viewer_role_enforcement.sql
drop policy if exists opportunities_insert on opportunities;
create policy opportunities_insert on opportunities for insert
  with check (is_org_write_member(organisation_id) or is_staff());

drop policy if exists opportunities_update on opportunities;
create policy opportunities_update on opportunities for update
  using (is_org_write_member(organisation_id) or is_staff())
  with check (is_org_write_member(organisation_id) or is_staff());

-- applications_select / applications_insert — true final version: 0046_employer_self_service_talent_search.sql
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

drop policy if exists applications_insert on applications;
create policy applications_insert on applications for insert
  with check (
    is_staff()
    or (talent_id = auth.uid() and source = 'applied')
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

-- reviews_select / reviews_insert — true final version: 0013_reviews_for_contracts.sql
drop policy if exists reviews_select on reviews;
create policy reviews_select on reviews for select
  using (
    is_staff()
    or (engagement_id is not null and is_engagement_participant(engagement_id))
    or (contract_id is not null and is_contract_participant(contract_id))
  );

drop policy if exists reviews_insert on reviews;
create policy reviews_insert on reviews for insert
  with check (
    is_staff()
    or (
      reviewer_id = auth.uid()
      and (
        (engagement_id is not null and is_engagement_participant(engagement_id))
        or (
          contract_id is not null
          and exists (
            select 1 from contracts c
            where c.id = contract_id
              and c.status = 'completed'
              and (
                (c.talent_id = auth.uid() and reviewer_role = 'talent')
                or (is_org_member(c.organisation_id) and reviewer_role = 'employer')
              )
          )
        )
      )
    )
  );

-- disputes_select / disputes_insert — true final version: 0024_phase5_contract_completion.sql
drop policy if exists disputes_select on disputes;
create policy disputes_select on disputes for select
  using (
    is_staff()
    or (engagement_id is not null and is_engagement_participant(engagement_id))
    or (contract_id is not null and is_contract_participant(contract_id))
  );

drop policy if exists disputes_insert on disputes;
create policy disputes_insert on disputes for insert
  with check (
    is_staff()
    or (
      raised_by = auth.uid()
      and (
        (engagement_id is not null and is_engagement_participant(engagement_id))
        or (contract_id is not null and is_contract_participant(contract_id))
      )
    )
  );

-- finance_records_select — true final version: 0026_payment_architecture.sql
drop policy if exists finance_records_select on finance_records;
create policy finance_records_select on finance_records for select
  using (
    is_staff()
    or (engagement_id is not null and is_engagement_participant(engagement_id))
    or (contract_id is not null and is_contract_participant(contract_id))
  );

-- Rollback: there isn't a meaningful one — this migration doesn't change
-- intended behavior, it makes the live database match what every one of
-- the 8 referenced migrations already intended and was already tracked as
-- applied. Rolling back would mean deliberately reintroducing the drift.
