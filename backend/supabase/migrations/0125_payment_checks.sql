-- Payment checks (PAYMENTS-FEES-GUARANTEE-CONSENT §1; owner go-ahead
-- 2026-11-21).
--
-- 1. reconciliation_runs: finance uploads a statement (MTN MoMo, mGurush or
--    a bank account) and the app matches each line against AdorWorks'
--    records — payments in by their provider/bank reference, payouts by
--    their disbursement reference. Each run keeps its totals and the lines
--    that didn't match, so problems are followed up, not lost.
-- 2. Wallet name check: before a talent's FIRST payout, finance records the
--    name the wallet or bank account is registered to (as MTN, mGurush or
--    the bank shows it). The app compares it with the talent's name and
--    holds the payout until it's confirmed. Changing the payout number or
--    account clears the check, so it's done again.
-- 3. The exchange rate (platform_settings 'fx', set by finance) is shown to
--    employers before they pay. No schema change for that.
--
-- Safe to re-run. Run AFTER 0124.

create table if not exists reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  account text not null check (account in ('mtn_momo', 'mgurush', 'bank_ssp', 'bank_usd')),
  period_start date,
  period_end date,
  file_name text check (file_name is null or char_length(file_name) <= 200),
  statement_lines int not null default 0,
  matched int not null default 0,
  unmatched_statement jsonb not null default '[]'::jsonb,
  missing_from_statement jsonb not null default '[]'::jsonb,
  amount_mismatches jsonb not null default '[]'::jsonb,
  uploaded_by uuid references profiles(id),
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists reconciliation_runs_created_idx on reconciliation_runs(created_at desc);
alter table reconciliation_runs enable row level security;
drop policy if exists reconciliation_runs_select on reconciliation_runs;
create policy reconciliation_runs_select on reconciliation_runs for select using (is_finance_staff());
-- Writes only through the service layer.

alter table talent_payout_methods add column if not exists name_on_account text
  check (name_on_account is null or char_length(name_on_account) <= 160);
alter table talent_payout_methods add column if not exists name_checked_at timestamptz;
alter table talent_payout_methods add column if not exists name_checked_by uuid references profiles(id);

create or replace function reset_payout_name_check()
returns trigger
language plpgsql
as $$
begin
  if new.method is distinct from old.method
     or new.phone is distinct from old.phone
     or new.account_number is distinct from old.account_number
     or new.bank_name is distinct from old.bank_name then
    new.name_on_account := null;
    new.name_checked_at := null;
    new.name_checked_by := null;
  end if;
  return new;
end;
$$;
drop trigger if exists talent_payout_methods_reset_name_check on talent_payout_methods;
create trigger talent_payout_methods_reset_name_check
  before update on talent_payout_methods
  for each row execute function reset_payout_name_check();
