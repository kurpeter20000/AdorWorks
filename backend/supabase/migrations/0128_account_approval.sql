-- Every new account is approved by AdorWorks staff (owner, 2026-11-22).
--
-- New talent and employer accounts start as 'pending'. They can sign in
-- and finish their profile, ID and organisation details — which staff
-- need in order to verify them — but until a staff member approves them
-- they cannot apply for work, send a job for review, request a talent's
-- service or submit a service of their own. Staff approve talent in the
-- Talent section and employers in the Organisations section; a declined
-- account sees the reason and can message support.
--
-- Everyone who already has an account is approved (they were let in under
-- the old rules). Staff accounts, and the roles staff create directly
-- (onboarding agents, partner hub admins), are always approved. Accounts
-- staff create on someone's behalf are approved by the service layer.
--
-- Only the service role (the staff console's server code) can change an
-- approval — never the person themselves.
--
-- Safe to re-run. Run AFTER 0127.

-- 1. The approval state. Added with default 'approved' so every existing
--    account is approved, then the default becomes 'pending' for new ones.
alter table profiles add column if not exists approval_status text not null default 'approved'
  check (approval_status in ('pending', 'approved', 'declined'));
alter table profiles alter column approval_status set default 'pending';
alter table profiles
  add column if not exists approval_note text check (approval_note is null or char_length(approval_note) <= 500),
  add column if not exists approval_decided_at timestamptz,
  add column if not exists approval_decided_by uuid references profiles(id);

create index if not exists profiles_pending_approval_idx on profiles(created_at) where approval_status = 'pending';

-- 2. Who decides.
create or replace function guard_profiles_approval()
returns trigger language plpgsql
set search_path = public, pg_catalog
as $$
begin
  -- Roles that are never self-service sign-ups are always approved.
  if new.role::text not in ('talent', 'individual_client', 'org_member', 'org_admin', 'employer') then
    new.approval_status := 'approved';
    return new;
  end if;
  if auth.role() = 'service_role' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- Self-service sign-ups always start pending, whatever was sent.
    new.approval_status := 'pending';
    new.approval_note := null;
    new.approval_decided_at := null;
    new.approval_decided_by := null;
  elsif new.approval_status is distinct from old.approval_status
     or new.approval_note is distinct from old.approval_note
     or new.approval_decided_at is distinct from old.approval_decided_at
     or new.approval_decided_by is distinct from old.approval_decided_by then
    raise exception 'Account approval is decided by AdorWorks staff.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profiles_approval on profiles;
create trigger guard_profiles_approval before insert or update on profiles
  for each row execute function guard_profiles_approval();

-- 3. "Is the signed-in person approved?"
create or replace function account_approved()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select approval_status = 'approved' from profiles where id = auth.uid()), false);
$$;

-- 4. What waits for approval. The service role (staff tools) and staff
--    accounts are never blocked; everyone else must be approved. Trigger
--    names start with "a_" so this check runs (and explains itself)
--    before the other checks on these tables.
create or replace function require_account_approved()
returns trigger language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if auth.role() = 'service_role' or auth.uid() is null or is_staff() or account_approved() then
    return new;
  end if;
  if tg_table_name = 'opportunities' then
    if new.status = 'pending_review' and (tg_op = 'INSERT' or new.status is distinct from old.status) then
      raise exception 'Your account is waiting for approval by AdorWorks. You can send jobs for review once it''s approved.' using errcode = '42501';
    end if;
    return new;
  end if;
  if tg_table_name = 'talent_services' then
    if new.status = 'pending_review' and (tg_op = 'INSERT' or new.status is distinct from old.status) then
      raise exception 'Your account is waiting for approval by AdorWorks. You can submit services once it''s approved.' using errcode = '42501';
    end if;
    return new;
  end if;
  -- applications, service_requests: creating one at all needs approval.
  raise exception 'Your account is waiting for approval by AdorWorks. You can do this once it''s approved.' using errcode = '42501';
end;
$$;

drop trigger if exists require_approved_applications on applications;
drop trigger if exists a_require_approved_applications on applications;
create trigger a_require_approved_applications before insert on applications
  for each row execute function require_account_approved();

drop trigger if exists a_require_approved_service_requests on service_requests;
create trigger a_require_approved_service_requests before insert on service_requests
  for each row execute function require_account_approved();

drop trigger if exists a_require_approved_opportunities on opportunities;
create trigger a_require_approved_opportunities before insert or update of status on opportunities
  for each row execute function require_account_approved();

drop trigger if exists a_require_approved_talent_services on talent_services;
create trigger a_require_approved_talent_services before insert or update of status on talent_services
  for each row execute function require_account_approved();

-- Rollback:
--   drop trigger if exists a_require_approved_applications on applications;
--   drop trigger if exists a_require_approved_service_requests on service_requests;
--   drop trigger if exists a_require_approved_opportunities on opportunities;
--   drop trigger if exists a_require_approved_talent_services on talent_services;
--   drop function if exists require_account_approved(); drop function if exists account_approved();
--   drop trigger if exists guard_profiles_approval on profiles; drop function if exists guard_profiles_approval();
--   alter table profiles drop column if exists approval_decided_by, drop column if exists approval_decided_at,
--     drop column if exists approval_note, drop column if exists approval_status;
