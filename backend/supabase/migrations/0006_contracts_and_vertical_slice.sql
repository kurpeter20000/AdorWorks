-- AdorWorks — contracts, milestones, deliverables, messaging, work
-- history and mocked payment events: everything the Phase 1 vertical
-- slice needs beyond what 0001-0005 already provide.
--
-- Run this AFTER 0005_roles_and_assisted_onboarding.sql.

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------

do $$ begin
  create type engagement_type as enum (
    'freelance', 'fixed_term_contract', 'full_time', 'internship', 'apprenticeship', 'managed_service'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_basis as enum ('fixed', 'milestone', 'hourly', 'daily', 'monthly', 'negotiable');
exception when duplicate_object then null; end $$;

do $$ begin
  create type offer_status as enum ('draft', 'sent', 'accepted', 'declined', 'withdrawn');
exception when duplicate_object then null; end $$;

do $$ begin
  create type contract_status as enum ('active', 'completed', 'cancelled', 'disputed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type milestone_status as enum ('pending', 'submitted', 'approved', 'revision_requested', 'paid');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Extend opportunities: engagement_type/payment_basis distinctions and
-- a non-zero-compensation rule. AdorWorks is a PAID-opportunity
-- platform (spec rule: internships/apprenticeships included) — the
-- constraint below blocks a row from ever being 'open' without a real
-- compensation structure, checked at the database level as well as in
-- the application service layer (defense in depth, not either/or).
-- ---------------------------------------------------------------------

alter table opportunities add column if not exists engagement_type engagement_type;
alter table opportunities add column if not exists payment_basis payment_basis;
alter table opportunities add column if not exists compensation_amount numeric; -- for fixed/hourly/daily/monthly
alter table opportunities add column if not exists compensation_min numeric;    -- for a stated range
alter table opportunities add column if not exists compensation_max numeric;
alter table opportunities add column if not exists application_deadline date;
alter table opportunities add column if not exists number_of_openings int not null default 1;

do $$ begin
  alter table opportunities add constraint opportunities_paid_when_open check (
    status <> 'open' or (
      payment_basis is not null and (
        coalesce(compensation_amount, 0) > 0
        or coalesce(compensation_min, 0) > 0
        or coalesce(compensation_max, 0) > 0
      )
    )
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- screening_questions / saved_opportunities
-- ---------------------------------------------------------------------

create table if not exists screening_questions (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  question text not null,
  required boolean not null default true,
  sequence int not null default 0
);
create index if not exists screening_questions_opportunity_idx on screening_questions(opportunity_id);

create table if not exists screening_answers (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  screening_question_id uuid not null references screening_questions(id) on delete cascade,
  answer text,
  created_at timestamptz not null default now(),
  unique (application_id, screening_question_id)
);

create table if not exists saved_opportunities (
  talent_id uuid not null references talent_profiles(id) on delete cascade,
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (talent_id, opportunity_id)
);

-- ---------------------------------------------------------------------
-- offers — formal terms proposed to an applicant, before a contract
-- exists. Milestone-based offers carry their proposed milestone plan
-- here; accepting an offer is what creates the contract + real
-- milestone rows below.
-- ---------------------------------------------------------------------

create table if not exists offers (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  opportunity_id uuid not null references opportunities(id),
  talent_id uuid not null references talent_profiles(id),
  organisation_id uuid not null references organisations(id),
  payment_basis payment_basis not null,
  compensation_amount numeric,
  currency text not null default 'SSP',
  milestone_plan jsonb not null default '[]', -- [{title, amount, sequence}]
  message text,
  status offer_status not null default 'draft',
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create index if not exists offers_application_idx on offers(application_id);

-- ---------------------------------------------------------------------
-- contracts — the confirmed, in-delivery piece of work created once an
-- offer is accepted.
-- ---------------------------------------------------------------------

create table if not exists contracts (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references offers(id),
  opportunity_id uuid not null references opportunities(id),
  talent_id uuid not null references talent_profiles(id),
  organisation_id uuid not null references organisations(id),
  status contract_status not null default 'active',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contracts_talent_idx on contracts(talent_id);
create index if not exists contracts_org_idx on contracts(organisation_id);

create table if not exists milestones (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts(id) on delete cascade,
  title text not null,
  description text,
  amount numeric not null,
  currency text not null default 'SSP',
  sequence int not null default 0,
  status milestone_status not null default 'pending',
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists milestones_contract_idx on milestones(contract_id);

create table if not exists deliverables (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references milestones(id) on delete cascade,
  submitted_by uuid not null references profiles(id),
  file_path text, -- private storage bucket path, see below
  note text,
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'revision_requested')),
  created_at timestamptz not null default now()
);
create index if not exists deliverables_milestone_idx on deliverables(milestone_id);

create table if not exists timesheets (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  hours numeric not null,
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);
create index if not exists timesheets_contract_idx on timesheets(contract_id);

-- ---------------------------------------------------------------------
-- work_history — generated when a contract completes; the durable,
-- public-facing record on a talent's Passport.
-- ---------------------------------------------------------------------

create table if not exists work_history (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references talent_profiles(id) on delete cascade,
  contract_id uuid not null references contracts(id),
  organisation_id uuid not null references organisations(id),
  title text not null,
  summary text,
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (contract_id)
);
create index if not exists work_history_talent_idx on work_history(talent_id);

-- ---------------------------------------------------------------------
-- Messaging — minimal for Phase 1 (a contract's own thread). Broader
-- messaging (pre-contract, opportunity-scoped) can extend this later.
-- ---------------------------------------------------------------------

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid references contracts(id) on delete cascade,
  application_id uuid references applications(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint conversations_scope check (contract_id is not null or application_id is not null)
);

create table if not exists conversation_members (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  primary key (conversation_id, user_id)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_idx on messages(conversation_id);

-- ---------------------------------------------------------------------
-- payment_events — the mocked-provider record. is_simulated defaults
-- true and there is deliberately no code path anywhere in this project
-- that sets it false, because no real payment provider is integrated.
-- ---------------------------------------------------------------------

create table if not exists payment_events (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid references milestones(id),
  contract_id uuid not null references contracts(id),
  provider_name text not null default 'mock',
  external_reference text not null,
  amount numeric not null,
  currency text not null default 'SSP',
  status text not null default 'succeeded' check (status in ('pending', 'succeeded', 'failed', 'refunded')),
  is_simulated boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists payment_events_contract_idx on payment_events(contract_id);

-- ---------------------------------------------------------------------
-- updated_at trigger for the new tables that have the column
-- ---------------------------------------------------------------------

do $$
declare
  t text;
begin
  for t in select unnest(array['contracts', 'milestones'])
  loop
    execute format(
      'drop trigger if exists set_updated_at on %I; create trigger set_updated_at before update on %I for each row execute function set_updated_at();',
      t, t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Private storage bucket for deliverable files
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('deliverables', 'deliverables', false)
on conflict (id) do nothing;
