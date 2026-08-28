-- AdorWorks — Stage 3 correction: an appeal path for a rejected opportunity.
--
-- 'rejected' opportunities are terminal by design (0041) — 'changes_
-- required' is the fixable path, reject is for genuinely non-fixable
-- submissions. talent_services already has adequate self-recourse after
-- rejection (reviseService: rejected -> draft, no staff gate). Opportunities
-- had none at all, which the playbook flags as a real gap: an employer
-- who believes a rejection was a mistake had literally no way to say so.
--
-- This adds a narrow appeal: the employer records a note (no status
-- change — RLS/the existing guard trigger already allow updating other
-- columns on their own org's rows regardless of status), and staff decide
-- whether to reopen it via the existing "Request changes" action (already
-- usable on any status, not just pending_review — only the staff console
-- UI was hiding that option for a rejected row).
--
-- Run this AFTER 0043_completeness_gate_for_review.sql.

alter table opportunities add column if not exists appeal_note text;
alter table opportunities add column if not exists appealed_at timestamptz;

-- Rollback: drop columns appeal_note, appealed_at.
