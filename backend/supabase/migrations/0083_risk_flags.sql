-- AdorWorks — S10-11: fraud and scam indicators.
--
-- The only prior mechanism was the reactive, user-submitted `reports`
-- table (0047) — nothing let staff proactively flag an employer, job,
-- talent, or file as suspicious before or without a formal decision.
-- risk_flags is deliberately separate from `reports`: a report is one
-- person's complaint about one thing; a risk flag is staff's own
-- judgement, can apply to any entity type (including a file path, which
-- has no table of its own to attach a column to), and stays open until
-- staff resolve it rather than following reports' open/reviewed/
-- dismissed/actioned lifecycle, which doesn't fit "this is still a
-- standing concern."
--
-- target_id is polymorphic (same tradeoff reports.target_id already
-- accepted — no real FK, staff have enough context via target_type +
-- note to act without one) except it's `text`, not `uuid`, since a
-- flagged "file" indicator is a storage path, not a row id.
--
-- Run this AFTER 0082_report_severity_and_assignment.sql.

create table if not exists risk_flags (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('organisation', 'opportunity', 'talent_profile', 'talent_service', 'file')),
  target_id text not null,
  indicator text not null check (indicator in ('fraud', 'scam', 'fake_identity', 'payment_risk', 'other')),
  note text not null,
  flagged_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  resolved boolean not null default false,
  resolved_by uuid references profiles(id),
  resolved_at timestamptz,
  resolution_notes text
);

create index if not exists risk_flags_target_idx on risk_flags(target_type, target_id);
create index if not exists risk_flags_resolved_idx on risk_flags(resolved);

alter table risk_flags enable row level security;

-- Staff-only end to end — unlike reports, there's no reporter-facing side at all.
drop policy if exists risk_flags_staff_all on risk_flags;
create policy risk_flags_staff_all on risk_flags for all
  using (is_staff())
  with check (is_staff());

-- Rollback: drop table risk_flags.
