-- AdorWorks — auto-provisioning + the public talent view
--
-- Run this AFTER 0002_rls.sql.

-- ---------------------------------------------------------------------
-- Auto-create a profiles row the moment someone signs up via Supabase
-- Auth, so the app never has to remember to do it client-side. Role
-- always starts as 'talent' — promoting someone to reviewer/matcher/
-- finance/admin is a deliberate manual step (see backend/supabase/README.md),
-- never something a signup request can request for itself.
-- ---------------------------------------------------------------------

create or replace function handle_new_auth_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, email_verified)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone',
    new.email_confirmed_at is not null
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- ---------------------------------------------------------------------
-- public_talent_profiles — the safe, column-limited subset of
-- talent_profiles that Find Talent's future self-service search can
-- read with the anon key. No phone/email/identity fields exist on
-- talent_profiles itself (those live in profiles and talent_evidence,
-- neither of which this view touches), and row visibility still comes
-- from talent_profiles' own RLS policy (public_visible = true) — this
-- view can't see anything the base table wouldn't already allow.
-- ---------------------------------------------------------------------

create or replace view public_talent_profiles as
select
  id,
  headline,
  category,
  skills,
  languages,
  location,
  work_mode,
  availability,
  years_experience,
  portfolio_url,
  verification_tier
from talent_profiles
where public_visible = true;

grant select on public_talent_profiles to anon, authenticated;
