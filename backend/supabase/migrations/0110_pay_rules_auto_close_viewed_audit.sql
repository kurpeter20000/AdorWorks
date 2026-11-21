-- Phase B1 of the redesign spec (decisions confirmed by the owner on
-- 2026-11-16):
--
-- 1. No-ghosting rule: an application the employer hasn't moved for 14
--    days is closed automatically, with a kind note to the talent.
-- 2. "Viewed" step: record when the employer first sees an application.
-- 3. Pay on every opportunity: "negotiable" can no longer be published;
--    pay must be an amount or a min–max range.
-- 4. Audit log is append-only.
--
-- Safe to re-run. Run AFTER 0109.

-- ---------------------------------------------------------------------
-- 1a. stage_changed_at — the clock for the 14-day rule. Only a stage
--     change moves it (routine edits don't reset it), and nobody can
--     set it by hand.
--
--     Backfill: every application still waiting gets NOW, i.e. a fresh
--     14-day window from the day this ships — so the first run doesn't
--     close a backlog of old applications in one sweep.
-- ---------------------------------------------------------------------
alter table applications add column if not exists stage_changed_at timestamptz;
update applications set stage_changed_at = now() where stage_changed_at is null and stage in ('submitted', 'shortlisted');
update applications set stage_changed_at = coalesce(updated_at, created_at) where stage_changed_at is null;
alter table applications alter column stage_changed_at set default now();
alter table applications alter column stage_changed_at set not null;

-- ---------------------------------------------------------------------
-- 2a. viewed_at — set once, by mark_applications_viewed() below.
-- ---------------------------------------------------------------------
alter table applications add column if not exists viewed_at timestamptz;

create or replace function applications_protect_clocks()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.stage_changed_at := now();
    new.viewed_at := null;
    return new;
  end if;
  if new.stage is distinct from old.stage then
    new.stage_changed_at := now();
  else
    new.stage_changed_at := old.stage_changed_at;
  end if;
  -- viewed_at only moves through mark_applications_viewed(); a talent
  -- (or anyone else) cannot fake "Viewed" or un-view an application.
  if coalesce(current_setting('adorworks.marking_viewed', true), '') <> 'true' then
    new.viewed_at := old.viewed_at;
  end if;
  return new;
end;
$$;
drop trigger if exists applications_protect_clocks on applications;
create trigger applications_protect_clocks before insert or update on applications
  for each row execute function applications_protect_clocks();

-- ---------------------------------------------------------------------
-- 2b. An employer opening an opportunity's applicants marks the ones they
--     can actually see as viewed (staff-assisted opportunities hide
--     'submitted' rows from employers, so those stay unviewed).
-- ---------------------------------------------------------------------
create or replace function mark_applications_viewed(p_opportunity_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_mode text;
  v_count integer;
begin
  select organisation_id, shortlisting_mode into v_org, v_mode from opportunities where id = p_opportunity_id;
  if v_org is null then
    return 0;
  end if;
  if not (is_org_member(v_org) or exists (select 1 from organisations where id = v_org and representative_id = auth.uid())) then
    raise exception 'Not a member of this organisation.' using errcode = '42501';
  end if;
  perform set_config('adorworks.marking_viewed', 'true', true);
  update applications
     set viewed_at = now()
   where opportunity_id = p_opportunity_id
     and viewed_at is null
     and stage not in ('withdrawn')
     and (v_mode = 'self_service' or stage <> 'submitted');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function mark_applications_viewed(uuid) from public, anon;
grant execute on function mark_applications_viewed(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 1b. The 14-day closer. Interviews are left alone (both sides are
--     already talking); only 'submitted' and 'shortlisted' close.
-- ---------------------------------------------------------------------
create or replace function close_silent_applications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  perform set_config('adorworks.system_cascade', 'true', true);
  with closed as (
    update applications a
       set stage = 'rejected',
           decision_reason = coalesce(
             a.decision_reason,
             'The employer did not respond within 14 days, so this application was closed. This is not a judgement on you — keep applying.'
           )
      from opportunities o
     where o.id = a.opportunity_id
       and a.stage in ('submitted', 'shortlisted')
       and a.stage_changed_at < now() - interval '14 days'
    returning a.talent_id, o.title
  )
  insert into notifications (user_id, type, title, body, link)
  select talent_id,
         'application_stage_changed',
         'Application closed after 14 days',
         'The employer did not respond to your application for "' || title || '" within 14 days, so we closed it. Keep applying — your Passport is still working for you.',
         '/applications'
    from closed;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function close_silent_applications() from public, anon, authenticated;

-- Daily at 03:15 UTC (06:15 Juba). Unschedule-then-schedule by name so
-- re-running this file never duplicates the job (same as 0045).
select cron.unschedule(jobid) from cron.job where jobname = 'close-silent-applications';
select cron.schedule('close-silent-applications', '15 3 * * *', 'select close_silent_applications();');

-- ---------------------------------------------------------------------
-- 3. Pay on every opportunity. Checked when an opportunity goes to staff
--    review or is published, and when its pay is edited while there —
--    so existing published rows aren't broken by unrelated updates
--    (e.g. the hourly expiry job), but none can (re)enter review or go
--    live without real pay.
-- ---------------------------------------------------------------------
create or replace function guard_opportunity_pay()
returns trigger language plpgsql as $$
begin
  if new.status in ('pending_review', 'open')
     and (
       tg_op = 'INSERT'
       or new.status is distinct from old.status
       or new.payment_basis is distinct from old.payment_basis
       or new.compensation_amount is distinct from old.compensation_amount
       or new.compensation_min is distinct from old.compensation_min
       or new.compensation_max is distinct from old.compensation_max
     ) then
    if new.payment_basis = 'negotiable' then
      raise exception 'Pay must be a fixed amount or a range — "negotiable" can no longer be published.' using errcode = '23514';
    end if;
    if not (
      coalesce(new.compensation_amount, 0) > 0
      or (coalesce(new.compensation_min, 0) > 0 and coalesce(new.compensation_max, 0) >= new.compensation_min)
    ) then
      raise exception 'Every opportunity needs pay: enter an amount, or a minimum and a maximum.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_opportunity_pay on opportunities;
create trigger guard_opportunity_pay before insert or update on opportunities
  for each row execute function guard_opportunity_pay();

-- ---------------------------------------------------------------------
-- 4. Audit log: append-only. The one update allowed is the database's
--    own "on delete set null" when a person's account is deleted.
-- ---------------------------------------------------------------------
create or replace function audit_events_append_only()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Audit events cannot be deleted.' using errcode = '42501';
  end if;
  if (to_jsonb(new) - 'actor_id' - 'subject_id') is distinct from (to_jsonb(old) - 'actor_id' - 'subject_id')
     or (new.actor_id is not null and new.actor_id is distinct from old.actor_id)
     or (new.subject_id is not null and new.subject_id is distinct from old.subject_id) then
    raise exception 'Audit events cannot be edited.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists audit_events_append_only on audit_events;
create trigger audit_events_append_only before update or delete on audit_events
  for each row execute function audit_events_append_only();
