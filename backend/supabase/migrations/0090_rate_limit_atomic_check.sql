-- AdorWorks — ultra-review finding (2026-09-25, High severity):
-- checkAndRecordAttempt() in platform/src/lib/domain/rateLimit.ts did
-- count-then-insert as two separate round trips, with the insert not
-- even awaited before the decision was returned. Two concurrent
-- requests for the same action+identifier (e.g. a burst of login or
-- MFA-challenge attempts fired in parallel) could both read the same
-- pre-insert count and both be granted — a real TOCTOU rate-limit
-- bypass, not theoretical, since this gate backs login/signup/
-- password-reset/mfa_challenge/report/invitation.
--
-- Moves the whole check-record-decide sequence into one Postgres
-- function, serialized per (action, identifier) via a transaction-
-- scoped advisory lock — concurrent requests for the SAME key now
-- queue instead of racing; requests for DIFFERENT keys are unaffected
-- (advisory locks are keyed, not table-wide), so this doesn't add
-- contention across unrelated users signing in at the same time.

create or replace function check_rate_limit(
  p_action text,
  p_identifier text,
  p_window_minutes int,
  p_max_attempts int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz := now() - (p_window_minutes || ' minutes')::interval;
  v_count int;
begin
  -- Held until this transaction ends — a second concurrent call for
  -- the same action+identifier blocks here until the first call's
  -- insert below has committed, closing the race.
  perform pg_advisory_xact_lock(hashtextextended(p_action || ':' || p_identifier, 0));

  delete from auth_rate_limit_attempts
    where action = p_action and identifier = p_identifier and created_at < v_window_start;

  select count(*) into v_count
    from auth_rate_limit_attempts
    where action = p_action and identifier = p_identifier and created_at >= v_window_start;

  insert into auth_rate_limit_attempts (action, identifier) values (p_action, p_identifier);

  return v_count < p_max_attempts;
end;
$$;

-- No RLS-policy grant needed for regular users to call this — it's
-- invoked only via the admin/service-role client (same access model
-- as the table itself, 0063's own comment).

-- Rollback: drop function check_rate_limit(text, text, int, int);
