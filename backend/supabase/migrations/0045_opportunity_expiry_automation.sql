-- AdorWorks — Stage 3 correction: automatic expiry of overdue opportunities.
--
-- application_deadline has always been stored but never read back —
-- nothing moved an opportunity out of 'open' once its deadline passed,
-- so a stale listing kept looking live to talent indefinitely. This adds
-- a distinct 'expired' status (separate from 'closed', which is the
-- employer's own deliberate action) plus a scheduled job that runs the
-- transition automatically.
--
-- Run this AFTER 0044_opportunity_rejection_appeal.sql. Requires the
-- pg_cron extension — Supabase projects can enable this from the SQL
-- Editor; if the CREATE EXTENSION statement below fails with a
-- permissions error, enable "pg_cron" from Database > Extensions in the
-- Supabase dashboard first, then re-run just this file.

alter type opportunity_status add value if not exists 'expired';

create extension if not exists pg_cron;

-- security definer: runs as the function owner (postgres), not as
-- whatever role happens to invoke it, so it bypasses RLS the same way
-- sync_organisation_verification_status() (0038) does. The open ->
-- expired transition was never staff-gated by guard_opportunities_
-- update() in the first place — same tier as open -> filled/closed/
-- cancelled — so no trigger change is needed here.
create or replace function expire_overdue_opportunities()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update opportunities
  set status = 'expired'
  where status = 'open'
    and application_deadline is not null
    and application_deadline < current_date;
end;
$$;

-- Runs hourly. Explicitly unschedule-then-reschedule by name so re-running
-- this file is idempotent rather than relying on a given pg_cron version's
-- own dedupe behaviour.
select cron.unschedule(jobid) from cron.job where jobname = 'expire-overdue-opportunities';
select cron.schedule('expire-overdue-opportunities', '0 * * * *', 'select expire_overdue_opportunities();');

-- Rollback: select cron.unschedule('expire-overdue-opportunities'); drop
-- function expire_overdue_opportunities(); the 'expired' enum value can't
-- be removed once added (a Postgres limitation) but becomes unused.
