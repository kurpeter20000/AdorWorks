-- AdorWorks — security fix: RLS's row-level UPDATE policies never
-- restricted which COLUMNS an owner can change on their own row. In
-- practice that meant any authenticated talent user could PATCH their
-- own profiles.role to 'admin', or their own talent_profiles
-- .verification_tier to 'adorcertified', directly via the REST API —
-- entirely bypassing staff review. This affects the already-deployed
-- system (0001-0002), not just anything new — apply this promptly.
--
-- Fix: BEFORE UPDATE triggers that block changes to specific protected
-- columns unless the acting role is staff (is_staff()) or the request
-- is authenticated as service_role (the Express API / any trusted
-- backend process — auth.role() returns 'service_role' for those,
-- 'authenticated' for a normal end-user session). RLS policies stay as
-- they are; this is a second, independent layer, not a replacement.
--
-- Run this AFTER 0007_rls_extended.sql.

create or replace function reject_unless_staff(column_changed boolean, message text)
returns void
language plpgsql
as $$
begin
  if column_changed and auth.role() <> 'service_role' and not is_staff() then
    raise exception '%', message using errcode = '42501'; -- insufficient_privilege
  end if;
end;
$$;

-- profiles: role and status are staff-only to change, with ONE
-- carve-out — a user may toggle their own role between the two
-- non-privileged base roles ('talent' <-> 'individual_client'), which
-- is what lets the self-service signup flow set the role the person
-- actually asked for (see platform/src/lib/actions/auth.ts). Neither
-- endpoint of that toggle is staff-adjacent, so this can never be used
-- to reach reviewer/matcher/finance/admin/onboarding_agent/
-- partner_hub_admin/org_admin/org_member.
create or replace function guard_profiles_update()
returns trigger language plpgsql as $$
declare
  is_safe_self_toggle boolean;
begin
  is_safe_self_toggle := (
    old.role in ('talent', 'individual_client')
    and new.role in ('talent', 'individual_client')
  );
  perform reject_unless_staff(
    new.role is distinct from old.role and not is_safe_self_toggle,
    'Only staff can change a profile role.'
  );
  perform reject_unless_staff(new.status is distinct from old.status, 'Only staff can change account status.');
  return new;
end;
$$;
drop trigger if exists guard_profiles_update on profiles;
create trigger guard_profiles_update before update on profiles
  for each row execute function guard_profiles_update();

-- talent_profiles: verification_tier and public_visible are staff-only
create or replace function guard_talent_profiles_update()
returns trigger language plpgsql as $$
begin
  perform reject_unless_staff(
    new.verification_tier is distinct from old.verification_tier,
    'Only staff can change a verification tier.'
  );
  perform reject_unless_staff(
    new.public_visible is distinct from old.public_visible,
    'Only staff can change public-profile visibility.'
  );
  return new;
end;
$$;
drop trigger if exists guard_talent_profiles_update on talent_profiles;
create trigger guard_talent_profiles_update before update on talent_profiles
  for each row execute function guard_talent_profiles_update();

-- organisations: verification_status is staff-only
create or replace function guard_organisations_update()
returns trigger language plpgsql as $$
begin
  perform reject_unless_staff(
    new.verification_status is distinct from old.verification_status,
    'Only staff can change organisation verification status.'
  );
  return new;
end;
$$;
drop trigger if exists guard_organisations_update on organisations;
create trigger guard_organisations_update before update on organisations
  for each row execute function guard_organisations_update();

-- opportunities: an org can draft/submit/pause/cancel its own brief,
-- but only staff can move it to 'open' (that's the moderation gate —
-- Blueprint's "review before publish" — and it's also where the
-- non-zero-compensation constraint from 0006 actually gets enforced in
-- practice, not just in theory) or touch the approval record.
create or replace function guard_opportunities_update()
returns trigger language plpgsql as $$
begin
  perform reject_unless_staff(
    new.status is distinct from old.status and new.status = 'open',
    'Only staff can publish an opportunity (move it to open).'
  );
  perform reject_unless_staff(
    new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at,
    'approved_by/approved_at are set by the approval process only.'
  );
  return new;
end;
$$;
drop trigger if exists guard_opportunities_update on opportunities;
create trigger guard_opportunities_update before update on opportunities
  for each row execute function guard_opportunities_update();
