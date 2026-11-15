-- Close holes reachable by calling the database directly (PostgREST with
-- the public anon key + the caller's own JWT), which bypasses every check
-- in backend/api and the platform's Server Actions.
--
-- 1. Staff could make themselves admin.            -> role/status: service_role only
-- 2. RLS staff powers ignored MFA and suspension.  -> is_staff()/is_admin()/is_finance_staff() require aal2 + active
-- 3. check_rate_limit() was callable by anyone.    -> revoke execute
-- 4. Every user's real name was readable.          -> names scoped to your own vouches
-- 5. A voucher could rewrite any column of a vouch.-> drop the direct-update policy (the app uses the admin client)
-- 6. Anonymous intake inserts could set any column.-> must start as 'new', review/convert columns empty, payload capped
--
-- Safe to re-run. Run AFTER 0108.

-- ---------------------------------------------------------------------
-- 2. Staff RLS powers need an MFA-verified (aal2) session AND an active
--    account. Express (middleware/auth.js) and the platform
--    (requireStaffMfa) already enforce aal2 for staff; this makes the
--    database agree, so a phished password alone, or a suspended staff
--    member's still-valid token, no longer unlocks staff-level RLS.
--    service_role (the API's admin client) bypasses RLS and is unaffected.
-- ---------------------------------------------------------------------
create or replace function staff_session_ok()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (select 1 from profiles where id = auth.uid() and status = 'active');
$$;

create or replace function is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(current_user_role() in ('reviewer', 'matcher', 'finance', 'admin'), false)
     and staff_session_ok();
$$;

create or replace function is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(current_user_role() = 'admin', false) and staff_session_ok();
$$;

create or replace function is_finance_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(current_user_role() in ('finance', 'admin'), false) and staff_session_ok();
$$;

-- ---------------------------------------------------------------------
-- 1. Profile role and status: only the backend (service_role) may change
--    them. Previously any staff member could — including setting their
--    own role to 'admin', bypassing the two-admin approval in
--    backend/api/src/routes/people.js. The self-service
--    talent <-> individual_client toggle used at signup is kept.
-- ---------------------------------------------------------------------
create or replace function guard_profiles_update()
returns trigger language plpgsql as $$
declare
  is_safe_self_toggle boolean;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  is_safe_self_toggle := (
    new.id = auth.uid()
    and old.role in ('talent', 'individual_client')
    and new.role in ('talent', 'individual_client')
  );
  if new.role is distinct from old.role and not is_safe_self_toggle then
    raise exception 'Profile roles can only be changed through the staff console.' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    raise exception 'Account status can only be changed through the staff console.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_profiles_update on profiles;
create trigger guard_profiles_update before update on profiles
  for each row execute function guard_profiles_update();

-- ---------------------------------------------------------------------
-- 3. check_rate_limit is security definer and deletes/inserts attempt
--    rows. Callable by anon, it let anyone lock a user out of login (by
--    email) or reset any bucket (p_window_minutes = 0). Its only callers
--    use the service-role client (platform lib/domain/rateLimit.ts,
--    backend/api routes/publicChat.js) or a security-definer trigger
--    (0094), so revoking breaks nothing.
-- ---------------------------------------------------------------------
revoke execute on function check_rate_limit(text, text, int, int) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Real names: only for people you share a vouch with (either side),
--    yourself, or staff. Its two readers (platform /passport and
--    /vouches) only ever ask for exactly those people.
-- ---------------------------------------------------------------------
create or replace function public.public_profile_names_rows()
returns table (id uuid, full_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name
  from public.profiles p
  where p.id = auth.uid()
     or is_staff()
     or exists (
       select 1 from public.vouches v
       where (v.talent_id = auth.uid() and v.voucher_id = p.id)
          or (v.voucher_id = auth.uid() and v.talent_id = p.id)
     );
$$;

-- ---------------------------------------------------------------------
-- 5. Vouches: respondToVouch (platform lib/actions/vouches.ts) writes via
--    the admin client after its own ownership + pending check, so the
--    voucher never needs a direct UPDATE grant. The old policy let them
--    change talent_id/statement and self-confirm. Staff moderation
--    (vouches_staff_update) is unchanged.
-- ---------------------------------------------------------------------
drop policy if exists vouches_voucher_update on vouches;

-- ---------------------------------------------------------------------
-- 6. Public intake forms: a new submission must look new. Payload is
--    capped at 32 KB (the largest real form is a few KB).
-- ---------------------------------------------------------------------
drop policy if exists intake_submissions_insert_public on intake_submissions;
create policy intake_submissions_insert_public on intake_submissions for insert
  with check (
    status = 'new'
    and reviewed_by is null
    and reviewed_at is null
    and converted_to_table is null
    and converted_to_id is null
    and pg_column_size(payload) <= 32768
  );
