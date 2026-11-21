-- Talent Charter (competitive brief, owner-approved 2026-11-21).
--
-- 1. At most 10 open applications per talent at once (submitted,
--    shortlisted, interviewing or offered). Checked in the app for a
--    friendly message; enforced here so no client can get round it.
--    Staff-added candidates (source <> 'applied') don't count against the
--    talent's own allowance and are never blocked.
-- 2. charter_monitor(): the staff "Charter monitor" — applications near
--    the 14-day answer promise, open listings without pay, and payments
--    not paid out 48 hours after they were received.
--
-- 3. verify_person(): the public "Verify this person" check. Anyone with
--    the link (talent share it themselves) sees the name, trust tier,
--    member-since date and completed contracts — never contact details.
--
-- Safe to re-run. Run AFTER 0117.

create or replace function enforce_open_application_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  open_count int;
begin
  if new.source is distinct from 'applied' then
    return new;
  end if;
  if new.stage not in ('submitted', 'shortlisted', 'interviewing', 'offered') then
    return new;
  end if;
  -- An update that keeps an already-open application open isn't a new one.
  if tg_op = 'UPDATE' and old.stage in ('submitted', 'shortlisted', 'interviewing', 'offered') then
    return new;
  end if;
  select count(*) into open_count
  from applications
  where talent_id = new.talent_id
    and source = 'applied'
    and stage in ('submitted', 'shortlisted', 'interviewing', 'offered')
    and id <> new.id;
  if open_count >= 10 then
    raise exception 'open_application_cap: you already have 10 open applications'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists applications_open_cap on applications;
create trigger applications_open_cap
  before insert or update of stage on applications
  for each row execute function enforce_open_application_cap();

-- Staff-only overview of the Charter promises at risk.
create or replace function charter_monitor()
returns table (
  kind text,
  ref_id uuid,
  title text,
  detail text,
  since timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  -- Applications waiting 10+ days for an answer (promise: 14 days).
  select 'unanswered_application'::text, a.id, o.title,
         (extract(day from now() - a.created_at))::int || ' days without an answer',
         a.created_at
  from applications a
  join opportunities o on o.id = a.opportunity_id
  where is_staff()
    and a.stage = 'submitted'
    and a.created_at < now() - interval '10 days'
  union all
  -- Open listings with no pay shown (promise: pay on every listing).
  select 'listing_without_pay', o.id, o.title, 'Published without pay', o.created_at
  from opportunities o
  where is_staff()
    and o.status = 'open'
    and o.compensation_amount is null
    and (o.compensation_min is null or o.compensation_max is null)
  union all
  -- Payments received but not paid out 48 h later (promise: paid on
  -- approval). Held escrow counts from the end of its dispute window.
  select 'payout_overdue', pe.id, coalesce(o.title, 'Milestone payment'),
         pe.currency || ' ' || pe.net_amount || ' not yet paid to the talent',
         coalesce(pe.dispute_window_ends_at, pe.created_at)
  from payment_events pe
  left join contracts c on c.id = pe.contract_id
  left join opportunities o on o.id = c.opportunity_id
  where is_staff()
    and pe.status = 'succeeded'
    and coalesce(pe.disbursement_status, '') <> 'succeeded'
    and coalesce(pe.dispute_window_ends_at, pe.created_at) < now() - interval '48 hours'
    and (
      pe.escrow_status = 'held'
      or (pe.escrow_status = 'not_applicable'
          and pe.created_at >= coalesce((select (value #>> '{}')::timestamptz from platform_settings where key = 'payouts_queue_start'), now()))
    )
  order by 5 asc;
$$;

revoke all on function charter_monitor() from public, anon;
grant execute on function charter_monitor() to authenticated;

create or replace function verify_person(p_id uuid)
returns table (
  name text,
  verification_tier text,
  member_since date,
  completed_contracts int
)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(tp.display_name, ''), p.full_name, 'AdorWorks talent'),
         tp.verification_tier::text,
         p.created_at::date,
         (select count(*)::int from contracts c where c.talent_id = tp.id and c.status = 'completed')
  from talent_profiles tp
  join profiles p on p.id = tp.id
  where tp.id = p_id
    and p.status = 'active';
$$;

revoke all on function verify_person(uuid) from public;
grant execute on function verify_person(uuid) to anon, authenticated;
