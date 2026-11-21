-- Pathways cohorts, the programme partner dashboard, and phone sign-in
-- (PATHWAYS.md + competitive brief; owner 2026-11-21: EduPower Youth
-- Foundation is the first partner; phone sign-up switched on in Supabase).
--
-- 1. programmes become Pathways cohorts: which programme it is, who funds
--    it, where, when, the placement target, and a join code participants
--    type in (enrolment works without email).
-- 2. programme_partner_users: the partner's people who can open the
--    partner dashboard for a cohort. Partners see results only through
--    the service layer, which applies the privacy floor (no groups under
--    5, no names without consent and a signed agreement).
-- 3. Rate limiting gains 'phone_otp' for sending sign-in codes by SMS.
--    Keeps every action already allowed (0112's full list).
--
-- Safe to re-run. Run AFTER 0121.

-- 1. Cohorts -------------------------------------------------------------
alter table programmes add column if not exists programme_type text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'programmes_type_check') then
    alter table programmes add constraint programmes_type_check check (
      programme_type is null or programme_type in (
        'career_readiness', 'portfolio_studio', 'graduate_launchpad',
        'internship_bridge', 'train_the_trainer', 'hiring_young_people', 'other'
      )
    );
  end if;
end $$;
alter table programmes add column if not exists funder text check (funder is null or char_length(funder) <= 160);
alter table programmes add column if not exists region text check (region is null or char_length(region) <= 120);
alter table programmes add column if not exists starts_on date;
alter table programmes add column if not exists target_placed int check (target_placed is null or target_placed >= 0);
alter table programmes add column if not exists join_code text;
create unique index if not exists programmes_join_code_uidx on programmes(upper(join_code)) where join_code is not null;

alter table programme_members add column if not exists joined_via text not null default 'staff'
  check (joined_via in ('staff', 'code'));

-- 2. Partner users ---------------------------------------------------------
create table if not exists programme_partner_users (
  programme_id uuid not null references programmes(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  added_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  primary key (programme_id, user_id)
);
alter table programme_partner_users enable row level security;
drop policy if exists programme_partner_users_select on programme_partner_users;
create policy programme_partner_users_select on programme_partner_users for select
  using (is_staff() or user_id = auth.uid());
-- Writes only through the service layer.

-- 3. Phone sign-in rate limit ---------------------------------------------
alter table auth_rate_limit_attempts drop constraint if exists auth_rate_limit_attempts_action_check;
alter table auth_rate_limit_attempts add constraint auth_rate_limit_attempts_action_check
  check (action in (
    'login', 'signup', 'password_reset_request', 'mfa_challenge',
    'report', 'invitation', 'file_upload', 'public_chat',
    'account_appeal', 'phone_otp'
  ));
