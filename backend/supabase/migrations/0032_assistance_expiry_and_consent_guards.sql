-- AdorWorks — make assisted access expire in the database and prevent the
-- assisted user from changing assignment, scope, or expiry columns.
-- Run this AFTER 0031_timesheet_permission_hardening.sql.

update assistance_sessions
set status = 'expired'
where status in ('pending_consent', 'active')
  and expires_at <= now();

create or replace function is_assigned_active_agent(session_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from assistance_sessions s
    where s.id = session_id
      and s.agent_id = auth.uid()
      and s.status = 'active'
      and s.consent_recorded_at is not null
      and s.revoked_at is null
      and s.completed_at is null
      and s.expires_at > now()
  );
$$;

drop policy if exists assistance_sessions_select on assistance_sessions;
create policy assistance_sessions_select on assistance_sessions for select
  using (
    user_id = auth.uid()
    or is_staff()
    or (
      agent_id = auth.uid()
      and status in ('pending_consent', 'active')
      and revoked_at is null
      and expires_at > now()
    )
  );

drop policy if exists assisted_field_changes_select on assisted_field_changes;
create policy assisted_field_changes_select on assisted_field_changes for select
  using (
    is_staff()
    or exists (
      select 1
      from assistance_sessions s
      where s.id = session_id
        and (
          s.user_id = auth.uid()
          or (
            s.agent_id = auth.uid()
            and s.status = 'active'
            and s.consent_recorded_at is not null
            and s.revoked_at is null
            and s.completed_at is null
            and s.expires_at > now()
          )
        )
    )
  );

-- RLS limits rows, not columns. The assisted user gets only two exact
-- transitions: consent to a pending session, or revoke their own session.
create or replace function guard_assistance_sessions_update()
returns trigger
language plpgsql
as $$
declare
  protected_fields_unchanged boolean;
begin
  if auth.role() = 'service_role' or is_staff() then
    return new;
  end if;

  if auth.uid() is null or old.user_id <> auth.uid() or new.user_id <> old.user_id then
    raise exception 'Only the assisted user or authorised staff can change this session.'
      using errcode = '42501';
  end if;

  protected_fields_unchanged :=
    new.id is not distinct from old.id
    and new.assistance_request_id is not distinct from old.assistance_request_id
    and new.agent_id is not distinct from old.agent_id
    and new.scope is not distinct from old.scope
    and new.expires_at is not distinct from old.expires_at
    and new.created_at is not distinct from old.created_at;

  if not protected_fields_unchanged then
    raise exception 'Assignment, scope, and expiry can only be changed by authorised staff.'
      using errcode = '42501';
  end if;

  if old.status = 'pending_consent'
    and new.status = 'active'
    and old.consent_recorded_at is null
    and new.consent_recorded_at is not null
    and new.revoked_at is not distinct from old.revoked_at
    and new.revoked_by is not distinct from old.revoked_by
    and new.completed_at is not distinct from old.completed_at
    and old.expires_at > now()
  then
    return new;
  end if;

  if old.status in ('pending_consent', 'active')
    and new.status = 'revoked'
    and new.consent_recorded_at is not distinct from old.consent_recorded_at
    and old.revoked_at is null
    and new.revoked_at is not null
    and new.revoked_by = auth.uid()
    and new.completed_at is not distinct from old.completed_at
  then
    return new;
  end if;

  raise exception 'This assistance-session transition is not permitted.'
    using errcode = '42501';
end;
$$;

drop trigger if exists guard_assistance_sessions_update on assistance_sessions;
create trigger guard_assistance_sessions_update
  before update on assistance_sessions
  for each row execute function guard_assistance_sessions_update();

-- Rollback: restore the 0007 function and policies, then drop this trigger.
-- Keep expired rows expired; rollback must not fabricate renewed consent.
