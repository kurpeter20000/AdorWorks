-- Structured two-way reviews and the first-job boost (competitive brief,
-- 2026-11-21).
--
-- 1. Reviews gain three 1–5 scores and a "would work together again"
--    answer, asked of both sides with wording that fits each side:
--      employer about talent: quality of work, communication, on time
--      talent about employer: clear brief, communication, paid on time
--    review_highlights() publishes the averages (counts and averages only,
--    never any one review), and they feed the AdorCertified progress.
--    The overall star rating stays, so older reviews still count.
-- 2. First-job boost: AdorVerified (or higher) talent with no reviews yet
--    get one shortlist slot a month when staff match — so a new person
--    isn't stuck behind people who already have history. Marked on the
--    application; the once-a-month limit is enforced here.
--
-- Safe to re-run. Run AFTER 0120.

alter table reviews add column if not exists score_quality int;
alter table reviews add column if not exists score_communication int;
alter table reviews add column if not exists score_timeliness int;
alter table reviews add column if not exists would_work_again boolean;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reviews_scores_range') then
    alter table reviews add constraint reviews_scores_range check (
      (score_quality is null or score_quality between 1 and 5)
      and (score_communication is null or score_communication between 1 and 5)
      and (score_timeliness is null or score_timeliness between 1 and 5)
    );
  end if;
end $$;

create or replace function review_highlights(p_kind text, p_id uuid)
returns table (
  reviews int,
  avg_quality numeric,
  avg_communication numeric,
  avg_timeliness numeric,
  would_work_again_pct int
)
language sql stable security definer set search_path = public as $$
  with rv as (
    select r.* from reviews r
    join contracts c on c.id = r.contract_id
    where (p_kind = 'talent' and c.talent_id = p_id and r.reviewer_role = 'employer')
       or (p_kind = 'organisation' and c.organisation_id = p_id and r.reviewer_role = 'talent')
  )
  select
    (select count(*)::int from rv where score_quality is not null),
    (select round(avg(score_quality)::numeric, 1) from rv),
    (select round(avg(score_communication)::numeric, 1) from rv),
    (select round(avg(score_timeliness)::numeric, 1) from rv),
    (select case when count(would_work_again) = 0 then null
            else round(100.0 * count(*) filter (where would_work_again) / count(would_work_again))::int end from rv)
  where p_kind in ('talent', 'organisation');
$$;
revoke all on function review_highlights(text, uuid) from public;
grant execute on function review_highlights(text, uuid) to anon, authenticated;

-- First-job boost ------------------------------------------------------
alter table applications add column if not exists first_job_boost boolean not null default false;
create index if not exists applications_first_job_boost_idx on applications(talent_id, created_at) where first_job_boost;

create or replace function enforce_first_job_boost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not new.first_job_boost then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.first_job_boost then
    return new;
  end if;
  if not exists (
    select 1 from talent_profiles tp
    where tp.id = new.talent_id
      and tp.verification_tier in ('adorverified', 'adorcertified', 'team_lead')
  ) then
    raise exception 'first_job_boost: only AdorVerified talent or higher can be boosted' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from reviews r join contracts c on c.id = r.contract_id
    where c.talent_id = new.talent_id and r.reviewer_role = 'employer'
  ) then
    raise exception 'first_job_boost: this talent already has reviews' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from applications a
    where a.talent_id = new.talent_id and a.first_job_boost and a.id <> new.id
      and date_trunc('month', a.created_at at time zone 'Africa/Juba') = date_trunc('month', now() at time zone 'Africa/Juba')
  ) then
    raise exception 'first_job_boost: this talent has already had their boost this month' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists applications_first_job_boost on applications;
create trigger applications_first_job_boost
  before insert or update of first_job_boost on applications
  for each row execute function enforce_first_job_boost();
