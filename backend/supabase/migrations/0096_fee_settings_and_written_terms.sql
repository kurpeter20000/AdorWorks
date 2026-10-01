-- 0096 — Stage 16, step 1: configurable two-sided fees + written terms.
--
-- 1. platform_settings — a small key/value table for decisions that are
--    meant to change without a code release. First key: 'fees'
--    (founder decision 2026-10-01): employers pay 2.5% on top of the
--    agreed amount, talent receives the amount minus 7.5%. Seeded
--    DISABLED: the public Pricing page promises 0% until fees are
--    announced, so turning them on is a deliberate admin action
--    (/operations/settings), not a side effect of deploying this.
-- 2. payment_events gains the employer side of the fee. The existing
--    fee_percent / fee_amount / net_amount columns (0057) stay the
--    talent-side deduction, so historical rows keep their meaning.
--    Every fee is stamped at charge time — changing a rate never
--    rewrites a past payment.
-- 3. contract_terms — the written terms of each contract (South Sudan
--    Labour Act 2017, s.44: written particulars of the parties, the
--    work, its duration and remuneration, even where the agreement is
--    oral). Stored as immutable, versioned snapshots: if the terms
--    change (e.g. milestones edited), a new version is added and the
--    old one is kept as evidence of what was agreed when.
--
-- Rollback: drop table contract_terms; drop table platform_settings;
-- alter table payment_events drop column employer_fee_percent,
-- drop column employer_fee_amount, drop column total_charged;

-- ---------------------------------------------------------------------
-- platform_settings
-- ---------------------------------------------------------------------
create table if not exists platform_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

alter table platform_settings enable row level security;

-- Fee rates are disclosed to both sides at checkout and on receipts, so
-- any signed-in user may read them. Only finance/admin staff may change
-- them (the app also writes an audit event for every change).
drop policy if exists platform_settings_select on platform_settings;
create policy platform_settings_select on platform_settings for select
  using (auth.uid() is not null);

drop policy if exists platform_settings_update on platform_settings;
create policy platform_settings_update on platform_settings for update
  using (is_finance_staff())
  with check (is_finance_staff());

insert into platform_settings (key, value)
values ('fees', '{"enabled": false, "employer_percent": 2.5, "talent_percent": 7.5}'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- payment_events: employer-side fee
-- ---------------------------------------------------------------------
alter table payment_events add column if not exists employer_fee_percent numeric not null default 0;
alter table payment_events add column if not exists employer_fee_amount numeric not null default 0;
alter table payment_events add column if not exists total_charged numeric;
update payment_events set total_charged = amount + employer_fee_amount where total_charged is null;
alter table payment_events alter column total_charged set not null;

-- Any writer that doesn't know about the employer fee yet still gets a
-- correct total instead of a not-null failure.
create or replace function payment_events_fill_total()
returns trigger language plpgsql as $$
begin
  if new.total_charged is null then
    new.total_charged := new.amount + coalesce(new.employer_fee_amount, 0);
  end if;
  return new;
end $$;
drop trigger if exists payment_events_fill_total on payment_events;
create trigger payment_events_fill_total before insert on payment_events
  for each row execute function payment_events_fill_total();

comment on column payment_events.amount is 'The agreed milestone amount (before any fee).';
comment on column payment_events.employer_fee_amount is 'Fee added on top for the employer, stamped at charge time.';
comment on column payment_events.total_charged is 'What the employer actually paid: amount + employer_fee_amount.';
comment on column payment_events.fee_amount is 'Talent-side fee deducted from amount, stamped at charge time.';
comment on column payment_events.net_amount is 'What the talent receives: amount - fee_amount.';

-- ---------------------------------------------------------------------
-- contract_terms
-- ---------------------------------------------------------------------
create table if not exists contract_terms (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts(id) on delete cascade,
  version int not null,
  content jsonb not null,
  content_hash text not null,
  generated_at timestamptz not null default now(),
  unique (contract_id, version)
);
create index if not exists contract_terms_contract_idx on contract_terms(contract_id, version desc);

alter table contract_terms enable row level security;

drop policy if exists contract_terms_select on contract_terms;
create policy contract_terms_select on contract_terms for select
  using (is_contract_participant(contract_id) or is_staff());
-- No insert/update/delete policies: only the app's service layer writes
-- these (admin client), and existing versions are never edited.
