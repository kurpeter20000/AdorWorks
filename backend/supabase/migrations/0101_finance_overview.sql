-- AdorWorks — Finance overview: aggregate earned/spent/pending figures
-- for the signed-in user, consolidated across every one of their
-- contracts instead of only ever visible one contract at a time.
--
-- security definer SQL functions (not a client-side fetch-everything-
-- and-reduce()) for the same reason public_track_record() (0097) and
-- escrow_release_eligible() (0099) are: summing happens in Postgres, not
-- by pulling every historical payment_events row to the browser. Each
-- function reads auth.uid() itself rather than taking a target id as a
-- parameter — unlike public_track_record (deliberately answerable for
-- anyone, aggregate-only), these return one person's own money, so
-- there's no id parameter to ever get wrong or for the migration to have
-- to guard against someone else's.
--
-- Grouped by currency rather than a single summed total: the pilot runs
-- SSP-only in practice, but payment_events.currency is a real per-row
-- column with no constraint tying it to one value, so a blind sum
-- across currencies would be a silent correctness bug waiting for the
-- day a second currency actually appears.
--
-- Rollback:
--   drop function if exists talent_finance_summary();
--   drop function if exists employer_finance_summary();

create or replace function talent_finance_summary()
returns table (
  currency text,
  total_earned numeric,
  pending_payout numeric
)
language sql stable security invoker set search_path = public
as $$
  select
    pe.currency,
    coalesce(sum(pe.net_amount) filter (where pe.escrow_status in ('not_applicable', 'released')), 0) as total_earned,
    coalesce(sum(pe.net_amount) filter (where pe.escrow_status = 'held'), 0) as pending_payout
  from payment_events pe
  join contracts c on c.id = pe.contract_id
  where pe.status = 'succeeded'
    and c.talent_id = auth.uid()
  group by pe.currency;
$$;

grant execute on function talent_finance_summary() to authenticated;

create or replace function employer_finance_summary()
returns table (
  currency text,
  total_spent numeric,
  invoices_due_count bigint,
  invoices_due_amount numeric,
  milestones_to_pay_count bigint,
  milestones_to_pay_amount numeric
)
language plpgsql stable security definer set search_path = public
as $$
begin
  -- security definer (not invoker, unlike talent_finance_summary) only
  -- because this needs is_org_member() — same reasoning 0098/0099's
  -- functions already document for why a cross-table membership check
  -- needs definer rights; the auth.uid() scoping itself is identical in
  -- spirit to the talent function above, just reached through org
  -- membership instead of a direct talent_id match.
  --
  -- Three independent CTEs, not one three-way join — an org that has
  -- pending invoices/milestones but zero *succeeded* payments yet would
  -- otherwise have that whole currency group disappear: joining
  -- finance_records/milestones to payment_events on currency means a
  -- currency with no payment_events rows never produces a joined row at
  -- all, hiding exactly the "money owed but not yet paid" figures this
  -- function exists to show. Combining via the currencies each actually
  -- appears in (a union of the three CTEs' own currency columns), then
  -- left-joining each aggregate onto that, keeps every currency that has
  -- ANY activity, regardless of which of the three tables it's in.
  return query
  with my_contracts as (
    select c.id from contracts c where is_org_member(c.organisation_id)
  ),
  spent as (
    select pe.currency, sum(pe.total_charged) as total_spent
    from payment_events pe
    join my_contracts c on c.id = pe.contract_id
    where pe.status = 'succeeded'
    group by pe.currency
  ),
  invoices as (
    select fr.currency, count(*) as invoices_due_count, sum(fr.amount) as invoices_due_amount
    from finance_records fr
    join my_contracts c on c.id = fr.contract_id
    where fr.record_type = 'invoice' and fr.status = 'pending'
    group by fr.currency
  ),
  owed as (
    select m.currency, count(*) as milestones_to_pay_count, sum(m.amount) as milestones_to_pay_amount
    from milestones m
    join my_contracts c on c.id = m.contract_id
    where m.status = 'approved'
    group by m.currency
  ),
  currencies as (
    -- Qualified, not bare "currency" — RETURNS TABLE declares `currency`
    -- as an implicit PL/pgSQL variable in this function's own scope, and
    -- an unqualified reference inside the function body is ambiguous
    -- against that variable even though these CTEs have their own
    -- column of the same name. Confirmed live (42702) before this fix.
    select spent.currency from spent
    union
    select invoices.currency from invoices
    union
    select owed.currency from owed
  )
  select
    cur.currency,
    coalesce(spent.total_spent, 0),
    coalesce(invoices.invoices_due_count, 0),
    coalesce(invoices.invoices_due_amount, 0),
    coalesce(owed.milestones_to_pay_count, 0),
    coalesce(owed.milestones_to_pay_amount, 0)
  from currencies cur
  left join spent on spent.currency = cur.currency
  left join invoices on invoices.currency = cur.currency
  left join owed on owed.currency = cur.currency;
end;
$$;

grant execute on function employer_finance_summary() to authenticated;
