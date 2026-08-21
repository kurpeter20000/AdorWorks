-- AdorWorks — core schema
--
-- Implements the data model in the AdorWorks Startup & Website Blueprint
-- §7.9 (User, Talent profile, Evidence, Organisation, Opportunity,
-- Application/match, Engagement, Finance record, Review/case).
--
-- Run this in the Supabase SQL Editor (Project → SQL Editor → New query),
-- in order: 0001_schema.sql, then 0002_rls.sql, then 0003_views.sql.
-- Safe to re-run: every statement is idempotent (CREATE ... IF NOT EXISTS
-- / DROP ... IF EXISTS first) so re-pasting after a partial failure won't
-- error out on "already exists".

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------

do $$ begin
  create type user_role as enum ('talent', 'employer', 'reviewer', 'matcher', 'finance', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type verification_tier as enum ('registered', 'identity_verified', 'adorverified', 'adorcertified', 'team_lead');
exception when duplicate_object then null; end $$;

do $$ begin
  create type org_verification_status as enum ('pending', 'verified', 'rejected', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type category as enum ('creative_media', 'digital_technology', 'business_project_support');
exception when duplicate_object then null; end $$;

do $$ begin
  create type opportunity_type as enum ('service', 'project', 'contract', 'full_time', 'squad');
exception when duplicate_object then null; end $$;

do $$ begin
  create type opportunity_status as enum ('draft', 'pending_review', 'open', 'filled', 'closed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type application_stage as enum ('submitted', 'shortlisted', 'interviewing', 'offered', 'accepted', 'rejected', 'withdrawn');
exception when duplicate_object then null; end $$;

do $$ begin
  create type engagement_status as enum ('proposed', 'contracted', 'active', 'completed', 'cancelled', 'disputed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type finance_record_type as enum ('deposit', 'invoice', 'fee', 'payout', 'refund');
exception when duplicate_object then null; end $$;

do $$ begin
  -- Manual tracking only, per the blueprint's compliance-first rule: no
  -- licensed local payment partner is confirmed yet, so no state here
  -- means money actually moved through AdorWorks — these are records of
  -- what was agreed/invoiced/paid outside the platform.
  create type finance_status as enum ('pending', 'confirmed', 'reconciled', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type dispute_status as enum ('open', 'investigating', 'resolved', 'escalated');
exception when duplicate_object then null; end $$;

do $$ begin
  create type evidence_type as enum ('portfolio', 'identity', 'reference', 'assessment');
exception when duplicate_object then null; end $$;

do $$ begin
  create type evidence_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- profiles — one row per authenticated user (1:1 with auth.users),
-- carrying the role that drives every RLS policy in 0002_rls.sql.
-- ---------------------------------------------------------------------

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'talent',
  full_name text,
  phone text,
  phone_verified boolean not null default false,
  email_verified boolean not null default false,
  status text not null default 'active' check (status in ('active', 'suspended', 'deleted')),
  consent_terms_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- talent_profiles
-- ---------------------------------------------------------------------

create table if not exists talent_profiles (
  id uuid primary key references profiles(id) on delete cascade,
  headline text,
  bio text,
  category category,
  skills text[] not null default '{}',
  languages text[] not null default '{}',
  location text,
  work_mode text check (work_mode in ('remote', 'on_site', 'hybrid', 'any')),
  rate_min numeric,
  rate_max numeric,
  currency text default 'SSP',
  availability text,
  years_experience numeric,
  portfolio_url text,
  readiness jsonb not null default '{}', -- { device, connectivity, power_backup }
  verification_tier verification_tier not null default 'registered',
  public_visible boolean not null default false, -- staff flips true only once verified
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists talent_profiles_category_idx on talent_profiles(category);
create index if not exists talent_profiles_tier_idx on talent_profiles(verification_tier);
create index if not exists talent_profiles_skills_idx on talent_profiles using gin(skills);

-- ---------------------------------------------------------------------
-- talent_evidence — identity docs, portfolio items, references,
-- assessments. file_path points into a PRIVATE Supabase Storage bucket
-- (never public) — see backend/supabase/README.md for bucket setup.
-- ---------------------------------------------------------------------

create table if not exists talent_evidence (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references talent_profiles(id) on delete cascade,
  evidence_type evidence_type not null,
  file_path text,
  notes text,
  status evidence_status not null default 'pending',
  reviewer_id uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists talent_evidence_talent_idx on talent_evidence(talent_id);

-- ---------------------------------------------------------------------
-- verification_events — audit trail every time a talent's tier changes.
-- Satisfies the blueprint's rule: "every verification, stage change and
-- finance-status change records who changed it and when."
-- ---------------------------------------------------------------------

create table if not exists verification_events (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references talent_profiles(id) on delete cascade,
  old_tier verification_tier,
  new_tier verification_tier not null,
  reviewer_id uuid not null references profiles(id),
  notes text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- organisations
-- ---------------------------------------------------------------------

create table if not exists organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sector text,
  website text,
  registration_evidence_path text, -- private Storage bucket path
  representative_id uuid not null references profiles(id),
  billing_email text,
  verification_status org_verification_status not null default 'pending',
  risk_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists organisations_representative_idx on organisations(representative_id);

-- ---------------------------------------------------------------------
-- opportunities
-- ---------------------------------------------------------------------

create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  type opportunity_type not null,
  title text not null,
  brief text,
  category category,
  skills text[] not null default '{}',
  location text,
  work_mode text check (work_mode in ('remote', 'on_site', 'hybrid', 'any')),
  budget_min numeric,
  budget_max numeric,
  currency text default 'SSP',
  start_date date,
  deadline date,
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  status opportunity_status not null default 'draft',
  created_by uuid references profiles(id),
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists opportunities_org_idx on opportunities(organisation_id);
create index if not exists opportunities_status_idx on opportunities(status);
create index if not exists opportunities_skills_idx on opportunities using gin(skills);

-- ---------------------------------------------------------------------
-- applications — a talent matched or applied to an opportunity
-- ---------------------------------------------------------------------

create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  talent_id uuid not null references talent_profiles(id) on delete cascade,
  source text not null default 'matched' check (source in ('applied', 'matched')),
  suitability_score numeric,
  notes text,
  stage application_stage not null default 'submitted',
  decision_reason text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id, talent_id)
);
create index if not exists applications_opportunity_idx on applications(opportunity_id);
create index if not exists applications_talent_idx on applications(talent_id);

-- ---------------------------------------------------------------------
-- engagements — a confirmed piece of work in delivery
-- ---------------------------------------------------------------------

create table if not exists engagements (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id),
  application_id uuid references applications(id),
  talent_id uuid not null references talent_profiles(id),
  organisation_id uuid not null references organisations(id),
  contract_type text,
  scope text,
  milestones jsonb not null default '[]',
  status engagement_status not null default 'proposed',
  account_owner_id uuid references profiles(id), -- named AdorWorks contact, per blueprint §6.7
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists engagements_org_idx on engagements(organisation_id);
create index if not exists engagements_talent_idx on engagements(talent_id);
create index if not exists engagements_status_idx on engagements(status);

-- ---------------------------------------------------------------------
-- engagement_events — audit trail for every stage/milestone/file change
-- ---------------------------------------------------------------------

create table if not exists engagement_events (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagements(id) on delete cascade,
  event_type text not null check (event_type in ('stage_change', 'milestone_update', 'file_added', 'note')),
  old_value text,
  new_value text,
  actor_id uuid not null references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists engagement_events_engagement_idx on engagement_events(engagement_id);

-- ---------------------------------------------------------------------
-- finance_records — manual tracking only (see finance_status comment
-- above). No payment gateway is called from this schema.
-- ---------------------------------------------------------------------

create table if not exists finance_records (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagements(id) on delete cascade,
  record_type finance_record_type not null,
  amount numeric not null,
  currency text not null default 'SSP',
  status finance_status not null default 'pending',
  exchange_rate_basis text,
  notes text,
  recorded_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists finance_records_engagement_idx on finance_records(engagement_id);

-- ---------------------------------------------------------------------
-- reviews — mutual feedback after a completed engagement
-- ---------------------------------------------------------------------

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagements(id) on delete cascade,
  reviewer_role text not null check (reviewer_role in ('talent', 'employer')),
  reviewer_id uuid not null references profiles(id),
  rating int not null check (rating between 1 and 5),
  feedback text,
  created_at timestamptz not null default now()
);
create index if not exists reviews_engagement_idx on reviews(engagement_id);

-- ---------------------------------------------------------------------
-- disputes
-- ---------------------------------------------------------------------

create table if not exists disputes (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagements(id) on delete cascade,
  raised_by uuid not null references profiles(id),
  description text not null,
  status dispute_status not null default 'open',
  resolution text,
  resolved_by uuid references profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists disputes_engagement_idx on disputes(engagement_id);

-- ---------------------------------------------------------------------
-- intake_submissions — one flexible table behind all public-facing
-- forms (talent application, employer brief, shortlist request, service
-- request, general contact, insights subscribe). Staff triage these in
-- the console and convert the useful ones into the structured tables
-- above; nothing here is public-readable (see 0002_rls.sql).
-- ---------------------------------------------------------------------

create table if not exists intake_submissions (
  id uuid primary key default gen_random_uuid(),
  form_type text not null check (form_type in (
    'talent_application', 'employer_brief', 'shortlist_request',
    'service_request', 'general_contact', 'insights_subscribe'
  )),
  payload jsonb not null,
  status text not null default 'new' check (status in ('new', 'in_review', 'converted', 'archived')),
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  converted_to_table text,
  converted_to_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists intake_submissions_status_idx on intake_submissions(status);
create index if not exists intake_submissions_form_type_idx on intake_submissions(form_type);

-- ---------------------------------------------------------------------
-- updated_at auto-touch trigger, applied to every table that has the column
-- ---------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'profiles', 'talent_profiles', 'organisations', 'opportunities',
      'applications', 'engagements', 'finance_records', 'disputes'
    ])
  loop
    execute format(
      'drop trigger if exists set_updated_at on %I; create trigger set_updated_at before update on %I for each row execute function set_updated_at();',
      t, t
    );
  end loop;
end $$;
