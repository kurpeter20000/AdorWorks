-- AdorWorks — Stage 2: Service Studio draft foundation only.
--
-- This is deliberately narrow: talent can create, edit, and delete their
-- own DRAFT services. There is no submit-for-review action, no staff
-- publishing queue, and no public visibility yet — the master
-- implementation document's own staging puts the full lifecycle
-- (submission, staff review, publication, packages, FAQs, availability)
-- in Stage 3, not Stage 2. Building that now would mean reworking it
-- again next stage; this migration only lays the data model down.
--
-- Distinct from the existing service_packages table (0023), which is a
-- staff-curated catalogue employers pick from when posting an
-- opportunity — this is talent-authored and talent-owned.
--
-- Run this AFTER 0036_role_change_requests.sql.

create table if not exists talent_services (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references talent_profiles(id) on delete cascade,
  title text not null,
  category category,
  problem_solved text,
  deliverables text,
  exclusions text,
  payment_basis payment_basis,
  price numeric,
  currency text default 'SSP',
  turnaround text,
  status text not null default 'draft' check (status in ('draft', 'pending_review', 'published', 'paused', 'rejected', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists talent_services_talent_idx on talent_services(talent_id);
create index if not exists talent_services_status_idx on talent_services(status);

alter table talent_services enable row level security;

drop policy if exists talent_services_select on talent_services;
create policy talent_services_select on talent_services for select
  using (talent_id = auth.uid() or is_staff());

-- Insert/update/delete are all draft-only for the owning talent — there is
-- no path in this migration for a row to leave 'draft' at all (that
-- transition is Stage 3's staff-review gate, matching the
-- guard_opportunities_update precedent of 0008/0010).
drop policy if exists talent_services_insert on talent_services;
create policy talent_services_insert on talent_services for insert
  with check (talent_id = auth.uid() and status = 'draft');

drop policy if exists talent_services_update on talent_services;
create policy talent_services_update on talent_services for update
  using (talent_id = auth.uid() and status = 'draft')
  with check (talent_id = auth.uid() and status = 'draft');

drop policy if exists talent_services_delete on talent_services;
create policy talent_services_delete on talent_services for delete
  using (talent_id = auth.uid() and status = 'draft');

drop policy if exists talent_services_staff_all on talent_services;
create policy talent_services_staff_all on talent_services for all
  using (is_staff())
  with check (is_staff());

-- Rollback: drop table talent_services; (no other table references it).
