-- AdorWorks — extended roles, organisation membership, and the dual-path
-- (self-service + assisted) onboarding model.
--
-- Run this AFTER 0004_storage.sql. Extends user_role rather than
-- replacing it — existing rows (talent/employer/reviewer/matcher/
-- finance/admin) are untouched.

-- ---------------------------------------------------------------------
-- Extend user_role. Postgres requires each new enum value added
-- separately and (in older versions) outside a transaction block — the
-- IF NOT EXISTS guard makes this safe to re-run.
-- ---------------------------------------------------------------------

alter type user_role add value if not exists 'individual_client';
alter type user_role add value if not exists 'org_member';
alter type user_role add value if not exists 'org_admin';
alter type user_role add value if not exists 'onboarding_agent';
alter type user_role add value if not exists 'partner_hub_admin';

-- ---------------------------------------------------------------------
-- organisation_members — tenant isolation for organisations with more
-- than one user. organisations.representative_id (from 0001) remains
-- the original/primary contact; this table is what actually drives
-- "who can act for this org" from here on.
-- ---------------------------------------------------------------------

create table if not exists organisation_members (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default now(),
  unique (organisation_id, user_id)
);
create index if not exists organisation_members_org_idx on organisation_members(organisation_id);
create index if not exists organisation_members_user_idx on organisation_members(user_id);

-- Backfill: every existing organisation's representative becomes an
-- org_admin member, so nothing that already relied on
-- organisations.representative_id loses access.
insert into organisation_members (organisation_id, user_id, role)
select id, representative_id, 'admin' from organisations
on conflict (organisation_id, user_id) do nothing;

-- ---------------------------------------------------------------------
-- partner_hubs / onboarding_agents — who is allowed to assist, and
-- through which referring organisation (an NGO, a training programme,
-- a cybercafe partner, etc.)
-- ---------------------------------------------------------------------

create table if not exists partner_hubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_email text,
  contact_phone text,
  location text,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now()
);

create table if not exists onboarding_agents (
  id uuid primary key references profiles(id) on delete cascade,
  partner_hub_id uuid references partner_hubs(id),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- assistance_requests — someone asks for help, or a partner hub refers
-- them, before any session exists.
-- ---------------------------------------------------------------------

create table if not exists assistance_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references profiles(id), -- null if the person has no account yet
  partner_hub_id uuid references partner_hubs(id),
  preferred_channel text,
  preferred_language text,
  location text,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'assigned', 'closed', 'cancelled')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- assistance_sessions — the actual time-limited, scoped, consented
-- grant of access. This is the enforcement point for every "onboarding
-- agents must not..." rule in the spec: scope limits WHAT an agent can
-- touch, expiry/revocation limit HOW LONG, and every touch is logged
-- in assisted_field_changes below.
-- ---------------------------------------------------------------------

create table if not exists assistance_sessions (
  id uuid primary key default gen_random_uuid(),
  assistance_request_id uuid references assistance_requests(id),
  agent_id uuid not null references onboarding_agents(id),
  user_id uuid not null references profiles(id),
  scope jsonb not null default '{}', -- e.g. {"fields": ["skills","bio","portfolio_items"]}
  consent_recorded_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references profiles(id),
  completed_at timestamptz,
  status text not null default 'pending_consent' check (
    status in ('pending_consent', 'active', 'completed', 'revoked', 'expired')
  ),
  created_at timestamptz not null default now()
);
create index if not exists assistance_sessions_user_idx on assistance_sessions(user_id);
create index if not exists assistance_sessions_agent_idx on assistance_sessions(agent_id);

-- ---------------------------------------------------------------------
-- assisted_field_changes — immutable audit of every field an agent
-- touched during a session. Required by the spec regardless of whether
-- the change was ultimately kept.
-- ---------------------------------------------------------------------

create table if not exists assisted_field_changes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references assistance_sessions(id) on delete cascade,
  field_table text not null,
  field_name text not null,
  old_value text,
  new_value text,
  changed_at timestamptz not null default now()
);
create index if not exists assisted_field_changes_session_idx on assisted_field_changes(session_id);

-- ---------------------------------------------------------------------
-- Split legal_name/display_name out on talent_profiles (previously just
-- "headline"/"bio" — the spec wants legal name kept distinct from the
-- public-facing display name and optional honorific).
-- ---------------------------------------------------------------------

alter table talent_profiles add column if not exists legal_name text;
alter table talent_profiles add column if not exists display_name text;
alter table talent_profiles add column if not exists honorific text;

create table if not exists honorifics (
  code text primary key,
  label text not null
);

insert into honorifics (code, label) values
  ('mr', 'Mr'), ('mrs', 'Mrs'), ('ms', 'Ms'), ('mx', 'Mx'),
  ('dr', 'Dr'), ('prof', 'Prof'), ('eng', 'Eng')
on conflict (code) do nothing;

do $$ begin
  alter table talent_profiles
    add constraint talent_profiles_honorific_fkey
    foreign key (honorific) references honorifics(code);
exception when duplicate_object then null; end $$;
