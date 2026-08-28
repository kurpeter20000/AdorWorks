-- AdorWorks — Stage 4: reporting (flag a listing/profile as abusive or
-- spam). No such mechanism existed at all before this — the closest
-- thing, disputes (0006), is scoped to an existing contract/engagement
-- between two already-connected parties, not general abuse flagging by
-- anyone browsing.
--
-- target_id is polymorphic (opportunity / talent_service / talent_profile
-- / organisation) so it can't carry a real foreign key — the tradeoff is
-- no referential integrity (a reported row can later be deleted, leaving
-- an orphaned report); staff already see enough context (target_type +
-- the reporter's note) to act without it, and this keeps the table
-- simple rather than needing four nullable FK columns.
--
-- Run this AFTER 0046_employer_self_service_talent_search.sql.

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(id),
  target_type text not null check (target_type in ('opportunity', 'talent_service', 'talent_profile', 'organisation')),
  target_id uuid not null,
  reason text not null check (reason in ('spam', 'scam', 'inappropriate', 'misleading', 'other')),
  note text,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed', 'actioned')),
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists reports_target_idx on reports(target_type, target_id);
create index if not exists reports_status_idx on reports(status);

alter table reports enable row level security;

-- A reporter can see their own reports (so they know it went somewhere);
-- everything is visible to staff.
drop policy if exists reports_select on reports;
create policy reports_select on reports for select
  using (reporter_id = auth.uid() or is_staff());

-- Anyone signed in can file a report about anything — reason/note is
-- theirs, status/reviewed_by/reviewed_at are staff-only going forward.
drop policy if exists reports_insert on reports;
create policy reports_insert on reports for insert
  with check (reporter_id = auth.uid() and status = 'open' and reviewed_by is null and reviewed_at is null);

-- Only staff move a report through review.
drop policy if exists reports_staff_update on reports;
create policy reports_staff_update on reports for update
  using (is_staff())
  with check (is_staff());

-- Rollback: drop table reports (no other table references it).
