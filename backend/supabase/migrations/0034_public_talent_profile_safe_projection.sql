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
-- Postgres binds CREATE OR REPLACE VIEW columns positionally: existing
-- columns must keep their exact name AND position, or it errors with
-- "cannot change name of view column" (42P16) instead of silently
-- reordering. The original 0003 column list is reproduced here verbatim,
-- in its original order, with every new column appended after it —
-- nothing removed, renamed, or reordered.
--
-- Run this AFTER 0033_organisation_role_scopes.sql.

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
  avatar_path
from talent_profiles
where public_visible = true;

grant select on public_talent_profiles to anon, authenticated;

-- Rollback: recreate the view with only the original 0003 column list
-- (id, headline, category, skills, languages, location, work_mode,
-- availability, years_experience, portfolio_url, verification_tier).
-- Safe only if no new consumer has started depending on the added columns.
