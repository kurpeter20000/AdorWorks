-- Job alerts, structured locations and featured jobs (owner, 2026-11-22).
--
-- 1. Job alerts: talent switch them on themselves (off by default) and
--    tailor them: fields (categories), keywords/skills, kinds of work,
--    work mode and places. When staff publish a
--    job, every talent whose alert matches gets an in-app alert, plus an
--    email if they keep email on (and WhatsApp once that is connected).
-- 2. Locations: city/town, county, state and country for talent and for
--    organisations, so staff can see and filter who is where. The old
--    free-text talent_profiles.location stays (other screens read it) and
--    is kept in step by the app.
-- 3. Featured jobs: employers pay to have a job featured. They ask from
--    their job page (featured_requested_at); staff confirm payment and set
--    featured_until. Featured jobs list first on the public jobs page,
--    then the newest. Only staff (or the service role) can feature a job.
--
-- Safe to re-run. Run AFTER 0125.

-- 1. Job alerts --------------------------------------------------------------
alter table alert_preferences
  add column if not exists job_alerts_enabled boolean not null default false,
  add column if not exists job_alert_categories text[] not null default '{}',
  add column if not exists job_alert_keywords text[] not null default '{}',
  add column if not exists job_alert_engagement_types text[] not null default '{}',
  add column if not exists job_alert_work_modes text[] not null default '{}',
  add column if not exists job_alert_locations text[] not null default '{}',
  add column if not exists job_alert_email boolean not null default true;

alter table alert_preferences drop constraint if exists alert_preferences_job_alert_sizes;
alter table alert_preferences add constraint alert_preferences_job_alert_sizes check (
  cardinality(job_alert_categories) <= 3
  and cardinality(job_alert_keywords) <= 20
  and cardinality(job_alert_engagement_types) <= 10
  and cardinality(job_alert_work_modes) <= 4
  and cardinality(job_alert_locations) <= 10
);

-- The publish step reads every enabled alert; keep that cheap.
create index if not exists alert_preferences_job_alerts_idx on alert_preferences(user_id) where job_alerts_enabled;

-- 2. Locations ---------------------------------------------------------------
alter table talent_profiles
  add column if not exists city text check (city is null or char_length(city) <= 80),
  add column if not exists county text check (county is null or char_length(county) <= 80),
  add column if not exists state text check (state is null or char_length(state) <= 80),
  add column if not exists country text check (country is null or char_length(country) <= 80);

alter table organisations
  add column if not exists city text check (city is null or char_length(city) <= 80),
  add column if not exists county text check (county is null or char_length(county) <= 80),
  add column if not exists state text check (state is null or char_length(state) <= 80),
  add column if not exists country text check (country is null or char_length(country) <= 80);

create index if not exists talent_profiles_state_idx on talent_profiles(country, state);
create index if not exists organisations_state_idx on organisations(country, state);

-- 3. Featured jobs -----------------------------------------------------------
alter table opportunities
  add column if not exists featured_until timestamptz,
  add column if not exists featured_requested_at timestamptz,
  add column if not exists featured_by uuid references profiles(id);

create index if not exists opportunities_featured_idx on opportunities(featured_until desc nulls last) where status = 'open';

create or replace function guard_opportunity_featuring()
returns trigger language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    perform reject_unless_staff(new.featured_until is not null or new.featured_by is not null,
      'Only AdorWorks staff can feature a job.');
  else
    perform reject_unless_staff(
      new.featured_until is distinct from old.featured_until or new.featured_by is distinct from old.featured_by,
      'Only AdorWorks staff can feature a job.');
  end if;
  return new;
end;
$$;

drop trigger if exists guard_opportunity_featuring on opportunities;
create trigger guard_opportunity_featuring before insert or update on opportunities
  for each row execute function guard_opportunity_featuring();

-- Rollback:
--   drop trigger if exists guard_opportunity_featuring on opportunities;
--   drop function if exists guard_opportunity_featuring();
--   alter table opportunities drop column if exists featured_until, drop column if exists featured_requested_at, drop column if exists featured_by;
--   alter table organisations drop column if exists city, drop column if exists county, drop column if exists state, drop column if exists country;
--   alter table talent_profiles drop column if exists city, drop column if exists county, drop column if exists state, drop column if exists country;
--   alter table alert_preferences drop constraint if exists alert_preferences_job_alert_sizes,
--     drop column if exists job_alerts_enabled, drop column if exists job_alert_categories, drop column if exists job_alert_keywords,
--     drop column if exists job_alert_engagement_types, drop column if exists job_alert_work_modes, drop column if exists job_alert_locations,
--     drop column if exists job_alert_email;
