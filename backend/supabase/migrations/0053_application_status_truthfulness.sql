-- AdorWorks — Stage 5: applications must never sit in a stale, misleading
-- state once the opportunity behind them stops accepting applicants.
-- Before this, closing/filling/cancelling an opportunity (self-service,
-- 0046) or it expiring automatically (0045's cron job) left every
-- pending application exactly where it was — a talent's own /applications
-- page kept showing "Submitted"/"Shortlisted" for a role that was
-- already dead, with nothing to tell them otherwise.
--
-- A single trigger on opportunities (rather than patching every place
-- that can change its status — the self-service close action, the
-- expiry cron job, and staff's own generic status editor) is what makes
-- this actually comprehensive: whichever path causes the status change,
-- this fires. It intentionally does NOT touch 'paused' (temporary, by
-- design) or an application already at 'offered'/'accepted' (that
-- candidate is past the "just applying" stage and has their own offer
-- lifecycle) or already 'rejected'/'withdrawn' (nothing to change).
--
-- Run this AFTER 0052_application_notes.sql.

create or replace function close_out_stale_applications()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status is distinct from old.status and new.status in ('closed', 'cancelled', 'expired', 'filled') then
    -- Lets guard_applications_update_trigger (0049) recognize this as a
    -- trusted system cascade rather than an unauthorized stage change —
    -- transaction-local only (is_local = true), and only ever set from
    -- here, never reachable from a client request.
    perform set_config('adorworks.system_cascade', 'true', true);
    update applications
    set stage = 'rejected',
        decision_reason = coalesce(decision_reason, 'This opportunity is no longer accepting applications.')
    where opportunity_id = new.id
      and stage in ('submitted', 'shortlisted', 'interviewing');
  end if;
  return new;
end;
$$;

drop trigger if exists close_out_stale_applications_trigger on opportunities;
create trigger close_out_stale_applications_trigger
  after update on opportunities
  for each row execute function close_out_stale_applications();

-- Rollback: drop trigger close_out_stale_applications_trigger; drop
-- function close_out_stale_applications. Rows already cascaded to
-- 'rejected' are not reverted — the rollback only stops future cascades.
