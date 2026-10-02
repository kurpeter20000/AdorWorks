-- AdorWorks — Stage 16, step 5: institutional (INGO) account track.
--
-- 1. organisations gains org_type — self-declared at signup/edit (today
--    the only classification is the free-text, non-enforced `sector`
--    hint string), staff can correct it during verification review.
--    text + check constraint, not a new Postgres enum type, matching
--    0099's escrow_status/disbursement_status — easier to extend later
--    without an ALTER TYPE.
-- 2. finance_records (the 'invoice' record_type rows, already created
--    automatically on deliverable approval — see approveDeliverable in
--    contracts.ts) gains payment-terms columns so an institutional
--    invoice can state a due date and be confirmed paid by staff once
--    the employer's bank transfer clears, instead of going through
--    mobile money. These columns are meaningless for a normal
--    mobile-money-settled invoice and stay null there.
--
-- Rollback:
--   alter table organisations drop column org_type;
--   alter table finance_records drop column payment_terms_days, drop column due_date,
--     drop column bank_reference, drop column confirmed_by, drop column confirmed_at;

alter table organisations add column if not exists org_type text not null default 'company';
alter table organisations add constraint organisations_org_type_check
  check (org_type in ('individual', 'company', 'ngo', 'ingo', 'government', 'other'));

alter table finance_records add column if not exists payment_terms_days int;
alter table finance_records add column if not exists due_date date;
alter table finance_records add column if not exists bank_reference text;
alter table finance_records add column if not exists confirmed_by uuid references profiles(id);
alter table finance_records add column if not exists confirmed_at timestamptz;
