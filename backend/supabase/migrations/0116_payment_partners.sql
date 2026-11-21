-- Payment partners (owner decision, 2026-11-21): MTN Mobile Money (the
-- default), mGurush and bank transfer, for paying in and paying out.
-- Bank transfer is open to any bank (owner decision): employers pay from
-- whichever bank they use into AdorWorks' account (held at Equity Bank;
-- the details are a staff setting), and talent can be paid at any bank.
--
-- 1. Paying in: payment_intentions.provider gains 'bank_transfer' (the
--    same name the institutional invoice flow already records). The old
--    simulated card value 'visa_mastercard' stays allowed only so existing
--    rows still pass the check; the app no longer offers card.
-- 2. A bank-transfer payment waits for the money to arrive: a new
--    intention status 'awaiting_transfer' (the employer has the bank
--    details and a reference; finance staff confirm when it lands). One
--    open payment per milestone, whether processing or awaiting transfer.
-- 3. Paying out uses the talent's chosen method (talent_payout_methods,
--    0114). The payout record keeps which method and destination were
--    used, how many attempts were made, who recorded a manual payout
--    (mGurush and bank payouts are made by finance staff until those
--    partners' systems are connected), and a payout receipt number.
--    Payments made while escrow is off are paid out too (from 0116 on).
-- 4. Receipt numbers come from one sequence: AW-2026-000001, ... for
--    payments in and payouts alike. Only the service layer can draw them.
--
-- Safe to re-run. Run AFTER 0115.

-- ---------------------------------------------------------------------
-- 1. Pay-in providers
-- ---------------------------------------------------------------------
do $$
declare
  con record;
begin
  for con in
    select c.conname
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    where rel.relname = 'payment_intentions'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%provider%'
  loop
    execute format('alter table payment_intentions drop constraint %I', con.conname);
  end loop;
end $$;

alter table payment_intentions
  add constraint payment_intentions_provider_check
  check (provider in ('mtn_momo', 'mgurush', 'bank_transfer', 'visa_mastercard'));

-- ---------------------------------------------------------------------
-- 2. Bank transfer: an intention can wait for the transfer to arrive
-- ---------------------------------------------------------------------
do $$
declare
  con record;
begin
  for con in
    select c.conname
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    where rel.relname = 'payment_intentions'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%status%'
  loop
    execute format('alter table payment_intentions drop constraint %I', con.conname);
  end loop;
end $$;

alter table payment_intentions
  add constraint payment_intentions_status_check
  check (status in ('processing', 'awaiting_transfer', 'succeeded', 'failed'));

-- The reference the employer quotes on their bank transfer.
alter table payment_intentions add column if not exists transfer_reference text;
-- The fee rates the employer was quoted when they chose bank transfer, so
-- a rate change before the money arrives never changes what they owe.
alter table payment_intentions add column if not exists fee_settings jsonb;
-- The AdorWorks account details the employer was shown, so changing the
-- account in Settings never changes a transfer already under way.
alter table payment_intentions add column if not exists bank_account jsonb;
create unique index if not exists payment_intentions_transfer_reference_uidx
  on payment_intentions(transfer_reference) where transfer_reference is not null;

-- 0057 blocks two 'processing' payments for one milestone; the same must
-- hold while a bank transfer is awaited.
create unique index if not exists payment_intentions_one_awaiting_per_milestone
  on payment_intentions(milestone_id) where status = 'awaiting_transfer';

-- ---------------------------------------------------------------------
-- 3. Payout record
-- ---------------------------------------------------------------------
alter table payment_events add column if not exists payout_method text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payment_events_payout_method_check') then
    alter table payment_events add constraint payment_events_payout_method_check
      check (payout_method is null or payout_method in ('mtn_momo', 'mgurush', 'bank'));
  end if;
end $$;
-- What the money was sent to, as it was at the time (e.g. "MTN MoMo · +211912345678").
alter table payment_events add column if not exists payout_destination text;
alter table payment_events add column if not exists payout_attempts int not null default 0;
alter table payment_events add column if not exists payout_last_attempt_at timestamptz;
alter table payment_events add column if not exists payout_recorded_by uuid references profiles(id);
alter table payment_events add column if not exists payout_receipt_number text;
create unique index if not exists payment_events_payout_receipt_number_uidx
  on payment_events(payout_receipt_number) where payout_receipt_number is not null;

-- Every payment now goes out to the talent, including those paid while
-- escrow was off. Before 0116 those were never queued for payout (all of
-- them simulated or test payments), so the payouts queue only counts
-- not-held payments made from this moment on. Recorded once; re-running
-- keeps the first value.
insert into platform_settings (key, value)
values ('payouts_queue_start', to_jsonb(now()))
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 4. Sequential receipt numbers
-- ---------------------------------------------------------------------
create sequence if not exists receipt_number_seq;

create or replace function next_receipt_number()
returns text
language sql
volatile
security definer
set search_path = public
as $$
  select 'AW-' || to_char(now() at time zone 'Africa/Juba', 'YYYY') || '-' ||
         lpad(nextval('receipt_number_seq')::text, 6, '0');
$$;

revoke all on function next_receipt_number() from public;
revoke all on function next_receipt_number() from anon, authenticated;
grant execute on function next_receipt_number() to service_role;
