-- AdorWorks — Stage 2: multi-dimensional organisation verification.
--
-- organisations.verification_status has always been one field covering
-- everything at once (Blueprint §5.4's "employer verification checklist"
-- is followed manually off-platform, then one outcome is recorded). This
-- splits it into two tracked dimensions — registration (business
-- registration documents) and representative (does the signed-up person
-- actually represent the org) — each with its own status, method, and
-- decision trail. organisations.verification_status is kept as the
-- computed "headline" summary via a trigger, so every existing policy,
-- query, and UI that reads it (opportunity publishing eligibility, the
-- readiness panel, etc.) keeps working unchanged.
--
-- "method" is what makes alternative SME/NGO verification consistent and
-- auditable instead of an undocumented judgment call: staff records HOW
-- a check was verified, not just that it was.
--
-- Run this AFTER 0037_talent_services_foundation.sql.

create table if not exists verification_checks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  check_type text not null check (check_type in ('registration', 'representative')),
  status text not null default 'not_started' check (
    status in ('not_started', 'information_required', 'submitted', 'under_review', 'verified', 'rejected', 'suspended', 'expired')
  ),
  method text check (method in ('formal_registration', 'alternative_referral', 'physical_review', 'representative_attestation')),
  evidence_path text,
  reason text, -- staff's stated reason for the current status
  applicant_note text, -- the org's own response when asked for more information, or an appeal after rejection
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, check_type)
);

create index if not exists verification_checks_org_idx on verification_checks(organisation_id);

alter table verification_checks enable row level security;

-- Org reps can only ever READ their own checks. Every write — including
-- the org's own "submit more information" / appeal action — goes through
-- a server action using the service-role admin client after an ownership
-- check, same pattern as every other privileged-but-user-triggered action
-- in this schema (see setOrganisationEvidence, approveDeliverable, etc.).
-- This is deliberate, not an oversight: it's what lets the sync trigger
-- below update organisations.verification_status without needing to
-- weaken 0008's guard_organisations_update trigger at all — the write
-- always arrives as service_role, so that trigger's existing
-- "auth.role() = 'service_role' or is_staff()" branch already permits it.
drop policy if exists verification_checks_select on verification_checks;
create policy verification_checks_select on verification_checks for select
  using (is_staff() or is_org_representative(organisation_id));

drop policy if exists verification_checks_staff_write on verification_checks;
create policy verification_checks_staff_write on verification_checks for all
  using (is_staff())
  with check (is_staff());

create or replace function sync_organisation_verification_status()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_org_id uuid := coalesce(new.organisation_id, old.organisation_id);
  reg_status text;
  rep_status text;
  computed text;
begin
  select status into reg_status from verification_checks where organisation_id = v_org_id and check_type = 'registration';
  select status into rep_status from verification_checks where organisation_id = v_org_id and check_type = 'representative';

  if reg_status = 'suspended' or rep_status = 'suspended' then
    computed := 'suspended';
  elsif reg_status = 'rejected' or rep_status = 'rejected' then
    computed := 'rejected';
  elsif reg_status = 'verified' and rep_status = 'verified' then
    computed := 'verified';
  else
    computed := 'pending';
  end if;

  update organisations set verification_status = computed
  where id = v_org_id and verification_status is distinct from computed;

  return new;
end;
$$;

drop trigger if exists sync_organisation_verification_status_trigger on verification_checks;
create trigger sync_organisation_verification_status_trigger
  after insert or update or delete on verification_checks
  for each row execute function sync_organisation_verification_status();

-- Backfill so existing organisations don't regress to "not_started" —
-- an org already verified today gets both dimensions marked verified;
-- anything else gets both marked 'submitted' (they already went through
-- the single-status flow) so staff can split the decision retroactively
-- without losing today's outcome. This only ever reproduces each org's
-- current verification_status when the sync trigger recomputes it, so it
-- changes no visible behaviour.
insert into verification_checks (organisation_id, check_type, status, decided_at)
select
  id,
  'registration',
  case verification_status
    when 'verified' then 'verified'
    when 'rejected' then 'rejected'
    when 'suspended' then 'suspended'
    else 'submitted'
  end,
  case when verification_status in ('verified', 'rejected', 'suspended') then updated_at else null end
from organisations
on conflict (organisation_id, check_type) do nothing;

insert into verification_checks (organisation_id, check_type, status, decided_at)
select
  id,
  'representative',
  case verification_status
    when 'verified' then 'verified'
    when 'rejected' then 'rejected'
    when 'suspended' then 'suspended'
    else 'submitted'
  end,
  case when verification_status in ('verified', 'rejected', 'suspended') then updated_at else null end
from organisations
on conflict (organisation_id, check_type) do nothing;

-- Rollback: drop trigger sync_organisation_verification_status_trigger on
-- verification_checks; drop function sync_organisation_verification_status;
-- drop table verification_checks; organisations.verification_status is
-- untouched by rollback since the trigger only ever set it to values it
-- could already hold.
