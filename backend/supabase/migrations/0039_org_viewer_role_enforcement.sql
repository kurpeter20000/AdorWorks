-- AdorWorks — Stage 2: make 'viewer' actually read-only.
--
-- 0033 widened organisation_members.role to allow recruiter/hiring_manager/
-- finance/viewer, but nothing enforced any real difference yet — every
-- existing policy calls is_org_member(org_id), which only checks that a
-- membership row exists at all, not what role it holds. A 'viewer' could
-- already post/edit opportunities via RLS directly, which would make the
-- label actively misleading rather than just incomplete.
--
-- Scope, deliberately bounded: is_org_member() is used across ~15 policies
-- (opportunities, offers, applications, contracts). Rewriting all of them
-- to distinguish every new role is a much larger hardening pass than
-- Stage 2 can safely absorb in one migration. This migration only adds a
-- new is_org_write_member() helper and swaps it into the two opportunity
-- policies — posting/editing opportunities is the one action a "viewer"
-- role is meaningless without blocking. recruiter/hiring_manager/finance
-- behave identically to 'member' everywhere for now (no functionally
-- distinct surfaces exist for them yet); offers/applications/contracts
-- are NOT yet viewer-restricted — a real, documented limitation, not an
-- oversight (see docs/stage-2-identity-profiles-trust.md).
--
-- Run this AFTER 0038_organisation_verification_checks.sql.

create or replace function is_org_write_member(org_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from organisation_members
    where organisation_id = org_id and user_id = auth.uid() and role <> 'viewer'
  );
$$;

drop policy if exists opportunities_insert on opportunities;
create policy opportunities_insert on opportunities for insert
  with check (is_org_write_member(organisation_id) or is_staff());

drop policy if exists opportunities_update on opportunities;
create policy opportunities_update on opportunities for update
  using (is_org_write_member(organisation_id) or is_staff())
  with check (is_org_write_member(organisation_id) or is_staff());

-- Rollback: restore the 0020 versions of these two policies
-- (is_org_member() instead of is_org_write_member()), then
-- drop function is_org_write_member(uuid).
