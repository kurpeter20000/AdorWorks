-- AdorWorks — Stage 1 foundations: the public Passport page
-- (platform/src/app/passport/[id]/page.tsx) reads talent_profiles with
-- select("*"), bypassing the column-limited public_talent_profiles view
-- from 0003 entirely. That view predates avatar_path (0029), display_name
-- (0005), bio, and the professional links (0018), so it's missing columns
-- the public page actually renders today — which is exactly why the page
-- never used it. This migration catches the view up to what's genuinely
-- public-facing content (never rate_min/rate_max/currency/readiness/
-- consent_terms_at, which stay off this view) so the page can be pointed
-- at it instead of the unfiltered base table.
--
-- CREATE OR REPLACE VIEW only appends columns here — nothing is removed or
-- reordered, so this is safe for any existing consumer of the view.
--
-- Run this AFTER 0033_organisation_role_scopes.sql.

create or replace view public_talent_profiles as
select
  id,
  display_name,
  headline,
  bio,
  category,
  skills,
  languages,
  location,
  work_mode,
  availability,
  years_experience,
  portfolio_url,
  linkedin_url,
  github_url,
  website_url,
  avatar_path,
  verification_tier
from talent_profiles
where public_visible = true;

grant select on public_talent_profiles to anon, authenticated;

-- Rollback: recreate the view with only the original 0003 column list.
-- Safe only if no new consumer has started depending on the added columns.
