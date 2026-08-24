-- Phase 5 completion — closes three gaps found by audit:
--
-- 1. Disputes only ever worked against the legacy staff-created
--    `engagements` table (0001/0002). The self-service offer -> accept ->
--    contract flow (0006) never creates an `engagements` row, so a real
--    contract had no possible way to raise or resolve a dispute — the
--    exact same gap `reviews` had before 0013_reviews_for_contracts.sql
--    patched it. This does the equivalent patch for `disputes`.
-- 2. Messages are text-only — no attachment column, no storage bucket.
-- 3. `service_packages`/skills etc already handled in 0023; this migration
--    is unrelated to that, just numbered after it.
--
-- Timesheets already have a fully-usable table + permissive RLS
-- (0006/0007) — no schema change needed there, only app code.
-- work_history already has a public-read policy — no schema change
-- needed there either, only app code (and populating `summary`, which
-- this migration does not touch since that's an app-layer insert).

-- ---------------------------------------------------------------------
-- Disputes for contracts
-- ---------------------------------------------------------------------

alter table disputes add column if not exists contract_id uuid references contracts(id) on delete cascade;
alter table disputes alter column engagement_id drop not null;

do $$ begin
  alter table disputes add constraint disputes_scope check (engagement_id is not null or contract_id is not null);
exception when duplicate_object then null; end $$;

create index if not exists disputes_contract_idx on disputes(contract_id);

drop policy if exists disputes_select on disputes;
create policy disputes_select on disputes for select
  using (
    is_staff()
    or (engagement_id is not null and is_engagement_participant(engagement_id))
    or (contract_id is not null and is_contract_participant(contract_id))
  );

drop policy if exists disputes_insert on disputes;
create policy disputes_insert on disputes for insert
  with check (
    is_staff()
    or (
      raised_by = auth.uid()
      and (
        (engagement_id is not null and is_engagement_participant(engagement_id))
        or (contract_id is not null and is_contract_participant(contract_id))
      )
    )
  );

-- ---------------------------------------------------------------------
-- Message attachments
-- ---------------------------------------------------------------------

alter table messages add column if not exists file_path text;
alter table messages add column if not exists file_name text;

insert into storage.buckets (id, name, public)
values ('message-attachments', 'message-attachments', false)
on conflict (id) do nothing;

-- Upload path convention: message-attachments/{contract_id}/{filename} —
-- every conversation in this app is contract-scoped in practice (see
-- postSystemMessage in contracts.ts), so this reuses the same
-- is_contract_participant() folder-keyed pattern as the deliverables
-- bucket policy (0012).
drop policy if exists message_attachments_participant_all on storage.objects;
create policy message_attachments_participant_all on storage.objects
  for all
  using (
    bucket_id = 'message-attachments'
    and (is_staff() or is_contract_participant(((storage.foldername(name))[1])::uuid))
  )
  with check (
    bucket_id = 'message-attachments'
    and (is_staff() or is_contract_participant(((storage.foldername(name))[1])::uuid))
  );
