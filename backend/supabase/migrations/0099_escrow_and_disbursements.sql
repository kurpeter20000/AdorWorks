-- AdorWorks — Stage 16, step 4: escrow (hold + dispute window + release)
-- and MTN MoMo Disbursements, built in full but kept switched off for
-- real money (platform_settings.escrow.enabled = false, same pattern as
-- 0096's fee switch) until the legal questions in
-- docs/stage-16-payments-messaging-and-trust.md are answered and an MTN
-- merchant/disbursement agreement exists.
--
-- Design: escrow is tracked as a second dimension on payment_events, not
-- a new milestone status. payment_events.status='succeeded' keeps
-- meaning exactly what it already means everywhere else in the codebase
-- (reviews_require_paid_contract, invoice confirmation, milestone
-- 'paid') — the employer's charge went through. escrow_status is
-- orthogonal: whether the talent's share of that already-succeeded
-- charge has been held, released (disbursed), or doesn't apply (escrow
-- switched off, today's instant-settle behaviour). This keeps the blast
-- radius to payment_events and the new release action, rather than
-- rippling a new milestone status through every "is this paid?" check
-- in the app.
--
-- Rollback:
--   drop function if exists escrow_release_eligible();
--   alter table payment_events drop column escrow_status, drop column
--     dispute_window_ends_at, drop column disbursement_reference,
--     drop column disbursement_status, drop column disbursement_failure_reason,
--     drop column disbursed_at;
--   delete from platform_settings where key = 'escrow';

alter table payment_events add column if not exists escrow_status text not null default 'not_applicable';
alter table payment_events add constraint payment_events_escrow_status_check
  check (escrow_status in ('not_applicable', 'held', 'released'));

alter table payment_events add column if not exists dispute_window_ends_at timestamptz;
alter table payment_events add column if not exists disbursement_reference text;
alter table payment_events add column if not exists disbursement_status text;
alter table payment_events add constraint payment_events_disbursement_status_check
  check (disbursement_status is null or disbursement_status in ('pending', 'succeeded', 'failed'));
alter table payment_events add column if not exists disbursement_failure_reason text;
alter table payment_events add column if not exists disbursed_at timestamptz;

create index if not exists payment_events_escrow_held_idx on payment_events(escrow_status) where escrow_status = 'held';

insert into platform_settings (key, value)
values ('escrow', '{"enabled": false, "dispute_window_days": 3}'::jsonb)
on conflict (key) do nothing;

-- Staff-visible eligibility list for the manual release console
-- (/operations/payouts) — no automated scheduled trigger exists yet
-- (disbursement needs an outbound HTTP call to MTN, which plain SQL/
-- pg_cron can't make; see the existing pg_cron jobs in this codebase,
-- all pure-SQL status transitions). A held payment becomes eligible once
-- its dispute window has passed AND the contract has no open dispute —
-- security definer so it can check disputes/contracts regardless of the
-- caller's own RLS visibility into those rows, same pattern as
-- public_track_record() (0097).
-- plpgsql (not sql) so it can guard on is_staff() before returning
-- anything — this carries payment amounts and talent ids across every
-- contract on the platform, so unlike public_track_record() (0097,
-- deliberately anon-callable but aggregate-only) this must never answer
-- for a non-staff caller even though it's granted to `authenticated`.
create or replace function escrow_release_eligible()
returns table (
  payment_event_id uuid,
  contract_id uuid,
  milestone_id uuid,
  talent_id uuid,
  net_amount numeric,
  currency text,
  dispute_window_ends_at timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not is_staff() then
    return;
  end if;

  return query
  select pe.id, pe.contract_id, pe.milestone_id, c.talent_id, pe.net_amount, pe.currency, pe.dispute_window_ends_at
  from payment_events pe
  join contracts c on c.id = pe.contract_id
  where pe.escrow_status = 'held'
    and pe.dispute_window_ends_at is not null
    and pe.dispute_window_ends_at <= now()
    and not exists (
      select 1 from disputes d where d.contract_id = pe.contract_id and d.status <> 'resolved'
    );
end;
$$;

grant execute on function escrow_release_eligible() to authenticated;
