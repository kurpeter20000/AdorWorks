-- Phase 6 — payment architecture. Still "no payment gateway is called
-- anywhere" (see finance.js's own comment) — this is the same simulated,
-- manual-tracking model the blueprint has always specified pending a
-- licensed local payment partner, just finally wired to the self-service
-- contracts flow instead of only the legacy staff-created engagements.
--
-- 1. finance_records (0001) — "invoices" and "reconciliation" already
--    exist as concepts here (record_type='invoice', status='reconciled')
--    but, like disputes/reviews before their 0013/0024 patches, only ever
--    worked against engagement_id. Same patch, same reasoning: extend to
--    contract_id (+ milestone_id, since payment here is per-milestone).
-- 2. payment_intentions (new) — the pre-settlement record: an employer
--    has chosen a provider and entered a payer phone number, before the
--    (simulated) processing step resolves. Mirrors the real shape of a
--    payment-gateway PaymentIntent even though nothing external is
--    actually called.
-- 3. payment_events (0006) gains intention_id/invoice_id (linking a
--    settled payment back to what it was paying) and payer_phone/
--    receipt_number (what a receipt needs to display).

-- ---------------------------------------------------------------------
-- finance_records: extend to contracts
-- ---------------------------------------------------------------------

alter table finance_records add column if not exists contract_id uuid references contracts(id) on delete cascade;
alter table finance_records add column if not exists milestone_id uuid references milestones(id) on delete cascade;
alter table finance_records alter column engagement_id drop not null;

do $$ begin
  alter table finance_records add constraint finance_records_scope check (engagement_id is not null or contract_id is not null);
exception when duplicate_object then null; end $$;

create index if not exists finance_records_contract_idx on finance_records(contract_id);
create index if not exists finance_records_milestone_idx on finance_records(milestone_id);

drop policy if exists finance_records_select on finance_records;
create policy finance_records_select on finance_records for select
  using (
    is_staff()
    or (engagement_id is not null and is_engagement_participant(engagement_id))
    or (contract_id is not null and is_contract_participant(contract_id))
  );

-- Insert/update stay is_finance_staff()-only (0002) — an invoice is only
-- ever created by the app's own service layer (via the admin client, on
-- milestone approval), same "regular users never insert these directly"
-- boundary payment_events already draws, so no participant-insert branch
-- is added here the way disputes/reviews got one.

-- ---------------------------------------------------------------------
-- payment_intentions
-- ---------------------------------------------------------------------

create table if not exists payment_intentions (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts(id) on delete cascade,
  milestone_id uuid not null references milestones(id) on delete cascade,
  invoice_id uuid references finance_records(id),
  provider text not null check (provider in ('mgurush', 'mtn_momo')),
  payer_phone text not null,
  amount numeric not null,
  currency text not null default 'SSP',
  status text not null default 'processing' check (status in ('processing', 'succeeded', 'failed')),
  failure_reason text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists payment_intentions_contract_idx on payment_intentions(contract_id);
create index if not exists payment_intentions_milestone_idx on payment_intentions(milestone_id);

alter table payment_intentions enable row level security;
drop policy if exists payment_intentions_select on payment_intentions;
create policy payment_intentions_select on payment_intentions for select
  using (is_contract_participant(contract_id) or is_staff());
-- Same boundary as payment_events: only the service layer writes these.

-- ---------------------------------------------------------------------
-- payment_events: link back to what was paid, and receipt fields
-- ---------------------------------------------------------------------

alter table payment_events add column if not exists intention_id uuid references payment_intentions(id);
alter table payment_events add column if not exists invoice_id uuid references finance_records(id);
alter table payment_events add column if not exists payer_phone text;
alter table payment_events add column if not exists receipt_number text;
create unique index if not exists payment_events_receipt_number_uidx on payment_events(receipt_number) where receipt_number is not null;
