-- AdorWorks — S05-10: job/service preferences, scoped per the founder's
-- 2026-09-14 decision (see docs/governance/decision-log.md) to filter
-- and prioritize a talent's own /opportunities feed.
--
-- talent_profiles.category and .work_mode already exist and already
-- function as preferences (set during onboarding, shown on Passport) —
-- reused as-is rather than duplicated. The one genuinely missing piece
-- is a persisted "preferred work type," matching the coarse full_time /
-- freelance_contract bucket the Talent Mode switcher and the
-- /opportunities `workType` filter already use (see
-- components/mode-switcher.tsx and app/opportunities/page.tsx) — until
-- now that choice existed only as a per-visit URL param, never saved.

alter table talent_profiles
  add column if not exists preferred_engagement_type text
    check (preferred_engagement_type in ('full_time', 'freelance_contract'));

-- Rollback: alter table talent_profiles drop column preferred_engagement_type;
