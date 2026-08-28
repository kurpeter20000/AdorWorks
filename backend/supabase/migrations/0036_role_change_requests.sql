-- AdorWorks — Stage 2: maker-checker for the two highest-risk roles.
-- Stage 0's audit flagged that any single admin could unilaterally
-- promote an account to admin or finance with no second check. Scoped
-- narrowly on purpose (team is small): only admin/finance assignment
-- goes through this two-step flow. Every other role (reviewer, matcher,
-- org roles, talent, etc.) keeps today's single-step behaviour — see
-- backend/api/src/routes/people.js.
--
-- Run this AFTER 0035_audit_events.sql.

create table if not exists role_change_requests (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references profiles(id) on delete cascade,
  requested_role text not null check (requested_role in ('admin', 'finance')),
  requested_by uuid not null references profiles(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists role_change_requests_target_idx on role_change_requests(target_user_id);
create index if not exists role_change_requests_status_idx on role_change_requests(status);

alter table role_change_requests enable row level security;

-- Admin-only in both directions — this table exists specifically to gate
-- who can reach the admin/finance roles, so only current admins should be
-- able to see or act on it at all (not every staff role, unlike most
-- other staff-readable tables in this schema).
drop policy if exists role_change_requests_admin on role_change_requests;
create policy role_change_requests_admin on role_change_requests for all
  using (is_admin())
  with check (is_admin());

-- Rollback: drop table role_change_requests; (backend/api's people.js
-- route changes would need to revert to single-step assignment in the
-- same rollback — the table alone has no effect on existing data).
