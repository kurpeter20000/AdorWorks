-- AdorWorks — Stage 2: track completion of the free Trust & Safety
-- orientation (master doc §22/§19A). Additive, nullable column — no
-- backfill needed, nobody has completed something that didn't exist.
--
-- Run this AFTER 0039_org_viewer_role_enforcement.sql.

alter table talent_profiles add column if not exists safety_orientation_completed_at timestamptz;

-- Rollback (Stage 10: added retroactively -- this file had none):
--   alter table talent_profiles drop column if exists safety_orientation_completed_at;
-- Safe: nullable, no other migration or RLS policy depends on it.
