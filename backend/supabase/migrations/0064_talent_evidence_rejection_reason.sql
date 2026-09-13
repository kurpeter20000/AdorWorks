-- AdorWorks — S05-09: a rejected reference/credential currently shows
-- no reviewer feedback at all — talent_evidence has no column for it,
-- unlike talent_introduction_videos (0055) and opportunities (0021),
-- which both already have their own rejection_reason. This closes that
-- inconsistency the same way, not a new pattern.

alter table talent_evidence
  add column if not exists rejection_reason text;

-- Rollback: alter table talent_evidence drop column rejection_reason;
