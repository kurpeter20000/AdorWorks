-- Phase B3c of the redesign spec (owner decisions, 2026-11-16):
--
-- 1. How talent get paid: bank transfer, MTN MoMo or mGurush. The talent
--    keeps their own details; finance staff read them to pay out. Nobody
--    else can see them.
-- 2. Alerts: WhatsApp on or off (email already has its own switch), which events,
--    and quiet hours when nothing is sent to the phone. WhatsApp is the
--    chosen provider; sending switches on once the business account is
--    connected (app setting, not this file).
--
-- Safe to re-run. Run AFTER 0113.

-- ---------------------------------------------------------------------
-- 1. Payout method, one per talent.
-- ---------------------------------------------------------------------
create table if not exists talent_payout_methods (
  talent_id uuid primary key references talent_profiles(id) on delete cascade,
  method text not null check (method in ('bank', 'mtn_momo', 'mgurush')),
  -- Mobile money: the number the money goes to.
  phone text check (phone is null or phone ~ '^\+?[0-9]{9,15}$'),
  -- Bank transfer.
  bank_name text check (char_length(bank_name) <= 120),
  account_name text check (char_length(account_name) <= 120),
  account_number text check (account_number is null or account_number ~ '^[0-9A-Za-z -]{4,40}$'),
  updated_at timestamptz not null default now(),
  constraint talent_payout_methods_complete check (
    (method in ('mtn_momo', 'mgurush') and phone is not null)
    or (method = 'bank' and bank_name is not null and account_name is not null and account_number is not null)
  )
);

alter table talent_payout_methods enable row level security;
drop policy if exists talent_payout_methods_owner on talent_payout_methods;
create policy talent_payout_methods_owner on talent_payout_methods for all
  using (talent_id = auth.uid()) with check (talent_id = auth.uid());
drop policy if exists talent_payout_methods_finance_read on talent_payout_methods;
create policy talent_payout_methods_finance_read on talent_payout_methods for select
  using (is_finance_staff());

drop trigger if exists set_updated_at_talent_payout_methods on talent_payout_methods;
create trigger set_updated_at_talent_payout_methods before update on talent_payout_methods
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- 2. Alert preferences, one per person.
-- ---------------------------------------------------------------------
create table if not exists alert_preferences (
  user_id uuid primary key references profiles(id) on delete cascade,
  -- WhatsApp besides the app (the app always shows alerts; email has its
  -- own switch, profiles.email_notifications_enabled).
  whatsapp_enabled boolean not null default false,
  whatsapp_number text check (whatsapp_number is null or whatsapp_number ~ '^\+[0-9]{9,15}$'),
  -- What to be alerted about.
  application_updates boolean not null default true,
  new_matching_work boolean not null default true,
  messages boolean not null default true,
  -- No WhatsApp alerts between these local times (both null = none).
  quiet_from time,
  quiet_until time,
  timezone text not null default 'Africa/Juba' check (char_length(timezone) <= 64),
  updated_at timestamptz not null default now(),
  constraint alert_preferences_whatsapp_number check (not whatsapp_enabled or whatsapp_number is not null),
  constraint alert_preferences_quiet_pair check ((quiet_from is null) = (quiet_until is null))
);

alter table alert_preferences enable row level security;
drop policy if exists alert_preferences_owner on alert_preferences;
create policy alert_preferences_owner on alert_preferences for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists set_updated_at_alert_preferences on alert_preferences;
create trigger set_updated_at_alert_preferences before update on alert_preferences
  for each row execute function set_updated_at();
