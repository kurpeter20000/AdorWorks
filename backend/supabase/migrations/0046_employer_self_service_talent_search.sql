-- AdorWorks — Stage 4: employer self-service talent search.
--
-- shortlisting_mode = 'self_service' (0030) let an employer act on
-- applications for their own opportunity, but there was never a way for
-- them to proactively search talent and add someone directly — only
-- staff could do that (POST /api/applications, source = 'matched').
-- This is that same capability, narrowly extended to the opportunity's
-- own org, for self-service opportunities only.
--
-- Also widens 0030's two policies from is_org_representative() to
-- is_org_write_member() (0039) for consistency — 0030 predates 0039's
-- scoped employer roles and was never revisited, so an invited
-- recruiter/hiring_manager teammate (not the org's sole representative)
-- couldn't shortlist on a self-service opportunity at all. Still excludes
-- 'viewer', same as every other is_org_write_member() policy.
--
-- Run this AFTER 0045_opportunity_expiry_automation.sql.

-- public_talent_profiles (0034) has no created_at — needed here so the
-- new search can break ties by most-recently-joined, same fairness rule
-- staff's own suggested-candidates feature already uses ("ranked by
-- skill overlap... then most recently joined — not by rating or tenure,
-- so new talent surface on equal footing"). Appended at the end per
-- 0034's own column-order rule.
create or replace view public_talent_profiles as
select
  id,
  headline,
  category,
  skills,
  languages,
  location,
  work_mode,
  availability,
  years_experience,
  portfolio_url,
  verification_tier,
  display_name,
  bio,
  linkedin_url,
  github_url,
  website_url,
  avatar_path,
  created_at
from talent_profiles
where public_visible = true;

grant select on public_talent_profiles to anon, authenticated;

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

drop policy if exists applications_update_employer_self_service on applications;
create policy applications_update_employer_self_service on applications for update
  using (
    exists (
      select 1 from opportunities o
      where o.id = applications.opportunity_id
        and is_org_write_member(o.organisation_id)
        and o.shortlisting_mode = 'self_service'
    )
  )
  with check (
    stage in ('submitted', 'shortlisted', 'rejected')
    and exists (
      select 1 from opportunities o
      where o.id = applications.opportunity_id
        and is_org_write_member(o.organisation_id)
        and o.shortlisting_mode = 'self_service'
    )
  );

-- New: lets an org write-member insert an application directly (adding a
-- candidate they found themselves) — only for their own self-service
-- opportunity, only as source = 'matched' (same provenance value staff
-- already use for a non-self-initiated application), and only landing
-- at 'shortlisted' — never higher. Unlike the staff path (which starts
-- at 'submitted' and stays hidden from the employer until staff move it
-- forward, see applications.js), the employer here is choosing to add
-- someone directly, so there's no reveal step to skip.
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

-- Rollback: recreate applications_select/applications_update_employer_
-- self_service with is_org_representative() (0030's originals);
-- recreate applications_insert with 0002's original two-branch check;
-- recreate public_talent_profiles without the appended created_at column
-- (safe only if no consumer has started depending on it).
