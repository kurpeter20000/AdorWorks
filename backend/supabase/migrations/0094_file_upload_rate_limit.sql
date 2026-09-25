-- AdorWorks — S14-05 threat-model gap, still open after 0089/0090:
-- "file uploads have no rate limiting at all" (threat-model.md's own
-- recorded abuse case). Every upload in this app goes straight from
-- the browser to Supabase Storage via the client SDK (confirmed by
-- reading every upload component under platform/src/app — none of
-- them route bytes through a Server Action first, they only call a
-- server action afterward to record the resulting path), so a
-- Server-Action-level check like login/signup/mfa_challenge use would
-- never actually run — the upload itself never touches our server
-- code. The only place that sees every upload regardless of which
-- client code path triggered it is Postgres itself, so this is
-- enforced as a trigger on storage.objects rather than application code.
--
-- Reuses check_rate_limit() (0090) rather than building a second
-- mechanism — same atomic, advisory-lock-serialized check already
-- used for login/signup/etc. A generous 30-per-15-minutes global cap
-- (across every bucket combined, not per-bucket) — high enough that a
-- real user uploading a CV, an avatar, and several portfolio pieces in
-- one sitting never gets close, low enough to stop a scripted flood.
-- Service-role/staff-driven inserts are exempt: auth.uid() is null for
-- a service-role connection (no user JWT in context) and is_staff()
-- covers an authenticated staff session doing something on a talent's
-- behalf — neither is attacker-controlled the way an end user's own
-- upload volume is.
--
-- Run this AFTER 0093_fix_opportunities_applications_select_drift.sql.

alter table auth_rate_limit_attempts drop constraint auth_rate_limit_attempts_action_check;
alter table auth_rate_limit_attempts add constraint auth_rate_limit_attempts_action_check
  check (action in ('login', 'signup', 'password_reset_request', 'mfa_challenge', 'report', 'invitation', 'file_upload'));

create or replace function guard_storage_upload_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or is_staff() then
    return new;
  end if;

  if not check_rate_limit('file_upload', auth.uid()::text, 15, 30) then
    raise exception 'Too many uploads — please wait a few minutes and try again.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists storage_upload_rate_limit on storage.objects;
create trigger storage_upload_rate_limit
  before insert on storage.objects
  for each row
  execute function guard_storage_upload_rate_limit();

-- Rollback:
-- drop trigger if exists storage_upload_rate_limit on storage.objects;
-- drop function if exists guard_storage_upload_rate_limit();
-- alter table auth_rate_limit_attempts drop constraint auth_rate_limit_attempts_action_check;
-- alter table auth_rate_limit_attempts add constraint auth_rate_limit_attempts_action_check
--   check (action in ('login', 'signup', 'password_reset_request', 'mfa_challenge', 'report', 'invitation'));
