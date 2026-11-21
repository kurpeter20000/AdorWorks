-- Fixes from the Phase B review (2026-11-16).
--
-- 1. The two support roles (verifier, field_support) no longer count as
--    full staff in the database. 0111 made is_staff() true for them,
--    which (through ~60 older policies and guards) let them change
--    offers, applications, notifications and more by calling the
--    database directly. They now get read-only access to exactly the
--    queues they work; everything they change goes through the staff
--    API or the app's server actions, which already check their role.
-- 2. Signing confirms the terms version the person actually read, and
--    only on an active contract.
-- 3. Interview times are cancelled when an application leaves the
--    shortlist/interview stage; no reminders after that.
-- 4. The 14-day close leaves alone applications with interview times
--    offered, and its note no longer blames "the employer" (on
--    staff-assisted roles it's AdorWorks reviewing first).
-- 5. Picking an interview time can't race with a reschedule; a
--    reschedule clears the old booked time; staff (matchers) schedule
--    only on staff-assisted roles.
--
-- Safe to re-run. Run AFTER 0114.

-- ---------------------------------------------------------------------
-- 1. Full staff vs support roles.
-- ---------------------------------------------------------------------
create or replace function is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(current_user_role()::text in ('reviewer', 'trust_safety', 'finance', 'matcher', 'admin'), false)
     and staff_session_ok();
$$;

create or replace function is_support_staff(p_role text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(current_user_role()::text = p_role, false) and staff_session_ok();
$$;

-- Verifier: read the verification queues.
drop policy if exists talent_evidence_verifier_read on talent_evidence;
create policy talent_evidence_verifier_read on talent_evidence for select using (is_support_staff('verifier'));
drop policy if exists talent_introduction_videos_verifier_read on talent_introduction_videos;
create policy talent_introduction_videos_verifier_read on talent_introduction_videos for select using (is_support_staff('verifier'));
drop policy if exists verification_checks_verifier_read on verification_checks;
create policy verification_checks_verifier_read on verification_checks for select using (is_support_staff('verifier'));
drop policy if exists organisations_verifier_read on organisations;
create policy organisations_verifier_read on organisations for select using (is_support_staff('verifier'));

-- Field support: read support conversations (and who they're with) and
-- in-person help requests.
drop policy if exists conversations_field_support_read on conversations;
create policy conversations_field_support_read on conversations for select
  using (support_user_id is not null and is_support_staff('field_support'));
drop policy if exists messages_field_support_read on messages;
create policy messages_field_support_read on messages for select
  using (
    is_support_staff('field_support')
    and exists (select 1 from conversations c where c.id = messages.conversation_id and c.support_user_id is not null)
  );
drop policy if exists profiles_field_support_read on profiles;
create policy profiles_field_support_read on profiles for select
  using (
    is_support_staff('field_support')
    and exists (select 1 from conversations c where c.support_user_id = profiles.id)
  );
drop policy if exists assistance_requests_field_support_read on assistance_requests;
create policy assistance_requests_field_support_read on assistance_requests for select using (is_support_staff('field_support'));

-- ---------------------------------------------------------------------
-- 2. Sign the version you read, on an active contract.
-- ---------------------------------------------------------------------
drop function if exists sign_contract(uuid);
create or replace function sign_contract(p_contract_id uuid, p_terms_version int default null)
returns contract_signatures
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract contracts;
  v_party text;
  v_terms contract_terms;
  v_row contract_signatures;
begin
  select * into v_contract from contracts where id = p_contract_id;
  if v_contract.id is null then
    raise exception 'Contract not found.' using errcode = 'P0002';
  end if;
  if v_contract.talent_id = auth.uid() then
    v_party := 'talent';
  elsif is_org_write_member(v_contract.organisation_id)
     or exists (select 1 from organisations where id = v_contract.organisation_id and representative_id = auth.uid()) then
    v_party := 'organisation';
  else
    raise exception 'Only the people named in this contract can sign it.' using errcode = '42501';
  end if;
  if v_contract.status <> 'active' then
    raise exception 'Only an active contract can be signed.' using errcode = '23514';
  end if;

  select * into v_terms from contract_terms where contract_id = p_contract_id order by version desc limit 1;
  if v_terms.id is null then
    raise exception 'The written terms for this contract are not ready yet. Open the contract page and try again.' using errcode = 'P0002';
  end if;
  if p_terms_version is not null and p_terms_version <> v_terms.version then
    raise exception 'The terms changed since you opened this page. Read the latest version, then sign.' using errcode = '23514';
  end if;

  insert into contract_signatures (contract_id, terms_version, content_hash, party, signed_by)
  values (p_contract_id, v_terms.version, v_terms.content_hash, v_party, auth.uid())
  on conflict (contract_id, terms_version, party) do nothing
  returning * into v_row;
  if v_row.id is null then
    select * into v_row from contract_signatures
     where contract_id = p_contract_id and terms_version = v_terms.version and party = v_party;
  end if;
  return v_row;
end;
$$;
revoke all on function sign_contract(uuid, int) from public, anon;
grant execute on function sign_contract(uuid, int) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Interview times end with the interview stage.
-- ---------------------------------------------------------------------
create or replace function cancel_interview_slots_on_stage_exit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stage not in ('shortlisted', 'interviewing') and old.stage in ('shortlisted', 'interviewing') then
    update interview_slots set status = 'cancelled'
     where application_id = new.id and status in ('offered', 'chosen');
  end if;
  return new;
end;
$$;
drop trigger if exists cancel_interview_slots_on_stage_exit on applications;
create trigger cancel_interview_slots_on_stage_exit after update of stage on applications
  for each row execute function cancel_interview_slots_on_stage_exit();

-- Tidy times already left behind by applications that have moved on.
update interview_slots s set status = 'cancelled'
  from applications a
 where a.id = s.application_id
   and s.status in ('offered', 'chosen')
   and a.stage not in ('shortlisted', 'interviewing');

create or replace function send_interview_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sent integer := 0;
  r record;
begin
  for r in
    select s.id, s.starts_at, a.talent_id, g.representative_id, o.title, o.id as opportunity_id,
           (s.reminded_24h_at is null and s.starts_at <= now() + interval '24 hours' and s.starts_at > now() + interval '1 hour') as due_24,
           (s.reminded_1h_at is null and s.starts_at <= now() + interval '1 hour' and s.starts_at > now()) as due_1
      from interview_slots s
      join applications a on a.id = s.application_id
      join opportunities o on o.id = a.opportunity_id
      join organisations g on g.id = o.organisation_id
     where s.status = 'chosen' and a.stage = 'interviewing'
       and s.starts_at > now() and s.starts_at <= now() + interval '24 hours'
  loop
    if r.due_24 or r.due_1 then
      insert into notifications (user_id, type, title, body, link)
      values (r.talent_id, 'interview_reminder',
              case when r.due_1 then 'Your interview starts within the hour' else 'Your interview is tomorrow' end,
              'Interview for "' || coalesce(r.title, 'an opportunity') || '". Check the time and details in Applications.',
              '/applications');
      if r.representative_id is not null then
        insert into notifications (user_id, type, title, body, link)
        values (r.representative_id, 'interview_reminder',
                case when r.due_1 then 'An interview starts within the hour' else 'You have an interview tomorrow' end,
                'Interview for "' || coalesce(r.title, 'your opportunity') || '".',
                '/organisation/opportunities/' || r.opportunity_id);
      end if;
      if r.due_1 then
        update interview_slots set reminded_1h_at = now(), reminded_24h_at = coalesce(reminded_24h_at, now()) where id = r.id;
      else
        update interview_slots set reminded_24h_at = now() where id = r.id;
      end if;
      v_sent := v_sent + 1;
    end if;
  end loop;
  return v_sent;
end;
$$;
revoke all on function send_interview_reminders() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. The 14-day close: not while interview times are on offer, and a
--    note that's true for every kind of role.
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
             'No decision was made on this application within 14 days, so it was closed. This is not a judgement on you — keep applying.'
           )
      from opportunities o
     where o.id = a.opportunity_id
       and a.stage in ('submitted', 'shortlisted')
       and a.stage_changed_at < now() - interval '14 days'
       and not exists (
         select 1 from interview_slots s
          where s.application_id = a.id and s.status = 'offered' and s.starts_at > now()
       )
    returning a.talent_id, o.title
  )
  insert into notifications (user_id, type, title, body, link)
  select talent_id,
         'application_stage_changed',
         'Application closed after 14 days',
         'No decision was made on your application for "' || title || '" within 14 days, so we closed it. Keep applying — your Passport is still working for you.',
         '/applications'
    from closed;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function close_silent_applications() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Scheduling: staff only on staff-assisted roles; no race on picking;
--    a reschedule clears the old booked time.
-- ---------------------------------------------------------------------
create or replace function can_schedule_interview(p_application_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from applications a join opportunities o on o.id = a.opportunity_id
    where a.id = p_application_id
      and (
        is_org_write_member(o.organisation_id)
        or exists (select 1 from organisations g where g.id = o.organisation_id and g.representative_id = auth.uid())
        or (o.shortlisting_mode = 'staff_assisted' and is_staff() and current_user_role()::text in ('matcher', 'admin'))
      )
  );
$$;

create or replace function offer_interview_slots(p_application_id uuid, p_slots jsonb)
returns setof interview_slots
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app applications;
  v_slot jsonb;
  v_count int := jsonb_array_length(coalesce(p_slots, '[]'::jsonb));
  v_title text;
  v_had_chosen boolean;
begin
  if not can_schedule_interview(p_application_id) then
    raise exception 'You can''t schedule interviews for this application.' using errcode = '42501';
  end if;
  select * into v_app from applications where id = p_application_id for update;
  if v_app.stage not in ('shortlisted', 'interviewing') then
    raise exception 'Shortlist this applicant before offering interview times.' using errcode = '23514';
  end if;
  if v_count < 1 or v_count > 5 then
    raise exception 'Offer between 1 and 5 times.' using errcode = '23514';
  end if;

  select exists (select 1 from interview_slots where application_id = p_application_id and status = 'chosen') into v_had_chosen;
  update interview_slots set status = 'cancelled'
   where application_id = p_application_id and status in ('offered', 'chosen');
  if v_had_chosen then
    update applications set interview_scheduled_at = null where id = p_application_id;
  end if;

  for v_slot in select * from jsonb_array_elements(p_slots) loop
    if (v_slot->>'starts_at')::timestamptz <= now() + interval '1 hour' then
      raise exception 'Interview times must be at least an hour from now.' using errcode = '23514';
    end if;
    insert into interview_slots (application_id, starts_at, duration_minutes, mode, details, created_by)
    values (
      p_application_id,
      (v_slot->>'starts_at')::timestamptz,
      coalesce((v_slot->>'duration_minutes')::int, 30),
      coalesce(v_slot->>'mode', 'video'),
      nullif(trim(v_slot->>'details'), ''),
      auth.uid()
    );
  end loop;

  select o.title into v_title from opportunities o where o.id = v_app.opportunity_id;
  insert into notifications (user_id, type, title, body, link)
  values (v_app.talent_id, 'interview_times_offered', 'Pick a time for your interview',
          'The employer for "' || coalesce(v_title, 'an opportunity') || '" offered interview times. Pick the one that suits you.', '/applications');

  return query select * from interview_slots where application_id = p_application_id and status = 'offered' order by starts_at;
end;
$$;
revoke all on function offer_interview_slots(uuid, jsonb) from public, anon;
grant execute on function offer_interview_slots(uuid, jsonb) to authenticated;

create or replace function choose_interview_slot(p_slot_id uuid)
returns interview_slots
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot interview_slots;
  v_app applications;
  v_rep uuid;
  v_title text;
begin
  select * into v_slot from interview_slots where id = p_slot_id;
  -- Lock the application first (same order as offer_interview_slots), so
  -- a reschedule and a pick can't interleave.
  select * into v_app from applications where id = v_slot.application_id for update;
  if v_app.id is null or v_app.talent_id is distinct from auth.uid() then
    raise exception 'This interview time isn''t yours to choose.' using errcode = '42501';
  end if;
  select * into v_slot from interview_slots where id = p_slot_id for update;
  if v_slot.status <> 'offered' then
    raise exception 'That time is no longer available. Pick another, or message the employer.' using errcode = '23514';
  end if;
  if v_slot.starts_at <= now() then
    raise exception 'That time has already passed. Pick another, or message the employer.' using errcode = '23514';
  end if;
  if v_app.stage not in ('shortlisted', 'interviewing') then
    raise exception 'This application is no longer at the interview step.' using errcode = '23514';
  end if;

  update interview_slots set status = 'declined' where application_id = v_app.id and status = 'offered' and id <> p_slot_id;
  update interview_slots set status = 'chosen' where id = p_slot_id and status = 'offered' returning * into v_slot;
  if v_slot.id is null then
    raise exception 'That time is no longer available. Pick another, or message the employer.' using errcode = '23514';
  end if;

  perform set_config('adorworks.system_cascade', 'true', true);
  update applications
     set stage = 'interviewing', interview_scheduled_at = v_slot.starts_at
   where id = v_app.id;

  select o.title, g.representative_id into v_title, v_rep
    from opportunities o join organisations g on g.id = o.organisation_id
   where o.id = v_app.opportunity_id;
  if v_rep is not null then
    insert into notifications (user_id, type, title, body, link)
    values (v_rep, 'interview_time_chosen', 'An applicant picked an interview time',
            'An applicant for "' || coalesce(v_title, 'your opportunity') || '" picked an interview time.',
            '/organisation/opportunities/' || v_app.opportunity_id);
  end if;
  return v_slot;
end;
$$;
revoke all on function choose_interview_slot(uuid) from public, anon;
grant execute on function choose_interview_slot(uuid) to authenticated;
