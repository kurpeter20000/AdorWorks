-- AdorWorks — fixes a real bug found by live-testing the signup flow:
-- supabase.auth.signUp() does not establish a session until the email
-- is confirmed (this project requires confirmation), so the Server
-- Action's original approach — sign up, then run a follow-up
-- `profiles.update({ role })` as that user — was silently running in
-- an ANON context and updating zero rows. Every signup landed on the
-- table default ('talent'), regardless of what the person chose.
--
-- Fix: pass the intended role through signUp()'s user_metadata
-- (available to the trigger immediately, no session needed), and set
-- it correctly the moment the profiles row is created. The metadata
-- value is client-settable by anyone calling the Auth API directly, so
-- the trigger WHITELISTS it against the two non-privileged
-- self-selectable roles — the same safe set as the guard_profiles_update
-- trigger from 0008 — rather than trusting it outright. Anything else
-- (or nothing) falls back to 'talent'.
--
-- Run this AFTER 0008_prevent_self_escalation.sql.

create or replace function handle_new_auth_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  requested_role text;
  resolved_role user_role;
begin
  requested_role := new.raw_user_meta_data ->> 'intended_role';
  if requested_role in ('talent', 'individual_client') then
    resolved_role := requested_role::user_role;
  else
    resolved_role := 'talent';
  end if;

  insert into public.profiles (id, role, full_name, phone, email_verified)
  values (
    new.id,
    resolved_role,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone',
    new.email_confirmed_at is not null
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
