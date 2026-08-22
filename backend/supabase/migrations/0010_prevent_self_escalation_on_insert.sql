-- AdorWorks — security fix: 0008 added BEFORE UPDATE guard triggers for
-- protected columns (verification_tier, public_visible, verification_status,
-- opportunity status/approval), but talent_profiles, organisations and
-- opportunities are never auto-created by a trigger the way profiles is —
-- they're first written by an ordinary client-side INSERT the first time a
-- user saves their profile / registers an org / posts an opportunity. The
-- *_insert RLS policies for those three tables only check row ownership
-- (id = auth.uid() / representative_id = auth.uid()), never column values,
-- so a self-service user could bypass staff review entirely on that first
-- insert — e.g. insert their own talent_profiles row with
-- verification_tier = 'adorcertified' and public_visible = true straight
-- away, or insert an organisation with verification_status = 'verified',
-- or insert an opportunity with status = 'open' (the paid_when_open check
-- from 0006 only requires non-zero compensation, it doesn't require staff
-- approval). This is the same escalation class 0008 fixed, left open on
-- the INSERT path. profiles itself is included too for defense in depth,
-- even though its row is always created first by handle_new_auth_user
-- before a client could ever hold a session to race it.
--
-- Run this AFTER 0009_fix_signup_role_assignment.sql.

create or replace function guard_profiles_insert()
returns trigger language plpgsql as $$
begin
  perform reject_unless_staff(new.role <> 'talent' and new.role <> 'individual_client', 'Only staff can set a privileged role.');
  perform reject_unless_staff(new.status <> 'active', 'Only staff can set a non-default account status.');
  return new;
end;
$$;
drop trigger if exists guard_profiles_insert on profiles;
create trigger guard_profiles_insert before insert on profiles
  for each row execute function guard_profiles_insert();

create or replace function guard_talent_profiles_insert()
returns trigger language plpgsql as $$
begin
  perform reject_unless_staff(new.verification_tier <> 'registered', 'Only staff can set a verification tier.');
  perform reject_unless_staff(new.public_visible <> false, 'Only staff can make a profile publicly visible.');
  return new;
end;
$$;
drop trigger if exists guard_talent_profiles_insert on talent_profiles;
create trigger guard_talent_profiles_insert before insert on talent_profiles
  for each row execute function guard_talent_profiles_insert();

create or replace function guard_organisations_insert()
returns trigger language plpgsql as $$
begin
  perform reject_unless_staff(new.verification_status <> 'pending', 'Only staff can set organisation verification status.');
  return new;
end;
$$;
drop trigger if exists guard_organisations_insert on organisations;
create trigger guard_organisations_insert before insert on organisations
  for each row execute function guard_organisations_insert();

create or replace function guard_opportunities_insert()
returns trigger language plpgsql as $$
begin
  perform reject_unless_staff(new.status = 'open', 'Only staff can publish an opportunity (move it to open).');
  perform reject_unless_staff(new.approved_by is not null or new.approved_at is not null, 'approved_by/approved_at are set by the approval process only.');
  return new;
end;
$$;
drop trigger if exists guard_opportunities_insert on opportunities;
create trigger guard_opportunities_insert before insert on opportunities
  for each row execute function guard_opportunities_insert();
