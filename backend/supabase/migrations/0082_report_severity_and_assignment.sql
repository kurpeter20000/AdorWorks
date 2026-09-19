-- AdorWorks — S10-06: reports had status + reviewer/timestamp only — no
-- severity, no assignment/owner, and no resolution notes at all (the
-- 2026-09-19 audit's own words: "the one action type in this codebase
-- that both lacks a required reason and is not written to audit_events").
--
-- severity is staff-set at review time, not auto-derived from the
-- reporter's own `reason` category (spam/scam/inappropriate/misleading/
-- other) — a reporter's chosen category isn't a reliable severity signal
-- (a "spam" report can turn out to be a real scam once staff look, and
-- vice versa), so this stays a real staff judgement call, defaulting to
-- null until someone actually looks at it.
--
-- Run this AFTER 0081_account_suspension.sql.

alter table reports add column if not exists severity text check (severity in ('low', 'medium', 'high', 'critical'));
alter table reports add column if not exists assigned_to uuid references profiles(id);
alter table reports add column if not exists resolution_notes text;

create index if not exists reports_assigned_to_idx on reports(assigned_to);

-- Rollback: alter table reports drop column severity, assigned_to, resolution_notes.
