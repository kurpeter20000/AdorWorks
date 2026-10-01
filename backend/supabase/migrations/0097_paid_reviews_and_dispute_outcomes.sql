-- 0097 — Stage 16, step 2: ratings only after a paid contract; recorded
-- dispute outcomes; a public, aggregate-only track record.
--
-- 1. reviews: a BEFORE INSERT trigger (not just an RLS policy) so the rule
--    holds for every writer, including the service role and any future
--    feature: a contract review needs the contract completed, every
--    milestone paid, and at least one settled payment on record. Reputation
--    can only come from real, paid work.
-- 2. disputes gain an outcome (talent_favour / employer_favour /
--    mutual_agreement / unresolved) and a short outcome_summary written
--    for the parties. Resolving a dispute without an outcome is refused at
--    the database. Disputes resolved before this migration keep a null
--    outcome ("not recorded") — nothing is invented for them.
-- 3. public_track_record(kind, id): counts only — completed-and-paid
--    contracts, reviews, and disputes by outcome — for a talent or an
--    organisation. SECURITY DEFINER so anyone can see the record without
--    being able to read any individual dispute or contract.
--
-- Rollback: drop function public_track_record(text, uuid);
-- drop trigger reviews_require_paid_contract on reviews;
-- drop function reviews_require_paid_contract();
-- drop trigger disputes_require_outcome on disputes;
-- drop function disputes_require_outcome();
-- alter table disputes drop column outcome, drop column outcome_summary;

-- ---------------------------------------------------------------------
-- 1. Reviews require a completed, fully paid contract
-- ---------------------------------------------------------------------
create or replace function reviews_require_paid_contract()
returns trigger language plpgsql as $$
begin
  if new.contract_id is null then
    return new; -- legacy staff-managed engagements keep their own rules
  end if;
  if not exists (select 1 from contracts c where c.id = new.contract_id and c.status = 'completed') then
    raise exception 'Reviews open once the contract is completed.' using errcode = 'P0001';
  end if;
  if exists (select 1 from milestones m where m.contract_id = new.contract_id and m.status <> 'paid') then
    raise exception 'Reviews open once every milestone has been paid through AdorWorks.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from payment_events p where p.contract_id = new.contract_id and p.status = 'succeeded') then
    raise exception 'Reviews need a payment made through AdorWorks on this contract.' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists reviews_require_paid_contract on reviews;
create trigger reviews_require_paid_contract before insert on reviews
  for each row execute function reviews_require_paid_contract();

-- ---------------------------------------------------------------------
-- 2. Dispute outcomes
-- ---------------------------------------------------------------------
alter table disputes add column if not exists outcome text;
alter table disputes add column if not exists outcome_summary text;
do $$ begin
  alter table disputes add constraint disputes_outcome_check
    check (outcome is null or outcome in ('talent_favour', 'employer_favour', 'mutual_agreement', 'unresolved'));
exception when duplicate_object then null; end $$;

create or replace function disputes_require_outcome()
returns trigger language plpgsql as $$
begin
  if new.status = 'resolved' and old.status is distinct from 'resolved' and new.outcome is null then
    raise exception 'Record the outcome before resolving a dispute.' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists disputes_require_outcome on disputes;
create trigger disputes_require_outcome before update on disputes
  for each row execute function disputes_require_outcome();

-- ---------------------------------------------------------------------
-- 3. Public track record (aggregates only)
-- ---------------------------------------------------------------------
create or replace function public_track_record(p_kind text, p_id uuid)
returns table (
  paid_contracts int,
  reviews_received int,
  average_rating numeric,
  disputes_total int,
  disputes_open int,
  talent_favour int,
  employer_favour int,
  mutual_agreement int,
  unresolved int,
  outcome_not_recorded int
)
language sql stable security definer set search_path = public as $$
  with scoped as (
    select c.id, c.status
    from contracts c
    where (p_kind = 'talent' and c.talent_id = p_id)
       or (p_kind = 'organisation' and c.organisation_id = p_id)
  ),
  paid as (
    select s.id from scoped s
    where s.status = 'completed'
      and not exists (select 1 from milestones m where m.contract_id = s.id and m.status <> 'paid')
      and exists (select 1 from payment_events p where p.contract_id = s.id and p.status = 'succeeded')
  ),
  rv as (
    select r.rating from reviews r
    join scoped s on s.id = r.contract_id
    -- reviews ABOUT this party: written by the other side
    where (p_kind = 'talent' and r.reviewer_role = 'employer')
       or (p_kind = 'organisation' and r.reviewer_role = 'talent')
  ),
  d as (
    select dp.status, dp.outcome from disputes dp join scoped s on s.id = dp.contract_id
  )
  select
    (select count(*)::int from paid),
    (select count(*)::int from rv),
    (select round(avg(rating)::numeric, 1) from rv),
    (select count(*)::int from d),
    (select count(*)::int from d where status <> 'resolved'),
    (select count(*)::int from d where status = 'resolved' and outcome = 'talent_favour'),
    (select count(*)::int from d where status = 'resolved' and outcome = 'employer_favour'),
    (select count(*)::int from d where status = 'resolved' and outcome = 'mutual_agreement'),
    (select count(*)::int from d where status = 'resolved' and outcome = 'unresolved'),
    (select count(*)::int from d where status = 'resolved' and outcome is null)
  where p_kind in ('talent', 'organisation');
$$;

revoke all on function public_track_record(text, uuid) from public;
grant execute on function public_track_record(text, uuid) to anon, authenticated;
