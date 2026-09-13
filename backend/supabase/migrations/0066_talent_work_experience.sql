-- AdorWorks — S05-05: work experience. P0 in the Stage 5 tracker and
-- entirely missing until now — no work-history table, no date-range
-- fields, no "currently working here" concept anywhere. The only
-- proxy, talent_profiles.years_experience, isn't even set by any
-- current form.
--
-- "Currently working here" is expressed as end_date is null, not a
-- separate boolean — a second is_current flag could disagree with
-- end_date (e.g. both set), which a single nullable column can't.
--
-- Mirrors talent_portfolio_items' RLS shape exactly (owner, staff, or
-- the parent profile is public_visible) and — unlike 0018, which
-- shipped without one and needed 0056 to add it later — includes the
-- update policy from the start, since reordering is part of this
-- feature from day one, not a follow-up fix.

create table if not exists talent_work_experience (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references talent_profiles(id) on delete cascade,
  employer_name text not null,
  role_title text not null,
  start_date date not null,
  end_date date,
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint talent_work_experience_dates check (end_date is null or end_date >= start_date)
);
create index if not exists talent_work_experience_talent_idx on talent_work_experience(talent_id);

alter table talent_work_experience enable row level security;

drop policy if exists talent_work_experience_select on talent_work_experience;
create policy talent_work_experience_select on talent_work_experience for select
  using (
    talent_id = auth.uid()
    or is_staff()
    or exists (
      select 1 from talent_profiles tp
      where tp.id = talent_work_experience.talent_id and tp.public_visible = true
    )
  );

drop policy if exists talent_work_experience_insert on talent_work_experience;
create policy talent_work_experience_insert on talent_work_experience for insert
  with check (talent_id = auth.uid());

drop policy if exists talent_work_experience_update on talent_work_experience;
create policy talent_work_experience_update on talent_work_experience for update
  using (talent_id = auth.uid())
  with check (talent_id = auth.uid());

drop policy if exists talent_work_experience_delete on talent_work_experience;
create policy talent_work_experience_delete on talent_work_experience for delete
  using (talent_id = auth.uid());

-- Rollback: drop table talent_work_experience;
