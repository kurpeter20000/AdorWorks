-- AdorWorks — S05-04: education and qualifications. P1 in the Stage 5
-- tracker, entirely missing until now — no table, column, or UI anywhere.
--
-- Same shape and reasoning as talent_work_experience (0066): "currently
-- studying" is end_date is null, not a separate boolean; RLS mirrors
-- talent_portfolio_items/talent_work_experience exactly, including the
-- update policy from day one.

create table if not exists talent_education (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references talent_profiles(id) on delete cascade,
  institution_name text not null,
  qualification text not null,
  field_of_study text,
  start_date date not null,
  end_date date,
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint talent_education_dates check (end_date is null or end_date >= start_date)
);
create index if not exists talent_education_talent_idx on talent_education(talent_id);

alter table talent_education enable row level security;

drop policy if exists talent_education_select on talent_education;
create policy talent_education_select on talent_education for select
  using (
    talent_id = auth.uid()
    or is_staff()
    or exists (
      select 1 from talent_profiles tp
      where tp.id = talent_education.talent_id and tp.public_visible = true
    )
  );

drop policy if exists talent_education_insert on talent_education;
create policy talent_education_insert on talent_education for insert
  with check (talent_id = auth.uid());

drop policy if exists talent_education_update on talent_education;
create policy talent_education_update on talent_education for update
  using (talent_id = auth.uid())
  with check (talent_id = auth.uid());

drop policy if exists talent_education_delete on talent_education;
create policy talent_education_delete on talent_education for delete
  using (talent_id = auth.uid());

-- Rollback: drop table talent_education;
