-- AdorWorks — S08-02: resumable application drafts.
--
-- Deliberately a separate table from `applications`, not a new 'draft'
-- stage on that table: `applications.stage` already drives visibility
-- (applications_select's employer branch), guard_applications_update's
-- transition rules, the employer dashboard pipeline counts, and the staff
-- console — adding a stage value there would touch all of those. A
-- separate table keeps a draft invisible to the employer for free (the
-- employer never queries this table at all) and can't collide with the
-- real applications_insert uniqueness/deadline/status checks (0001/0073).
--
-- Run this AFTER 0077_opportunity_attachments.sql.

create table if not exists application_drafts (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  talent_id uuid not null references talent_profiles(id) on delete cascade,
  pitch text,
  answers jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (opportunity_id, talent_id)
);

alter table application_drafts enable row level security;

drop policy if exists application_drafts_owner_all on application_drafts;
create policy application_drafts_owner_all on application_drafts for all
  using (talent_id = auth.uid())
  with check (talent_id = auth.uid());

drop trigger if exists set_updated_at_application_drafts on application_drafts;
create trigger set_updated_at_application_drafts before update on application_drafts
  for each row execute function set_updated_at();

-- Rollback: drop table application_drafts.
