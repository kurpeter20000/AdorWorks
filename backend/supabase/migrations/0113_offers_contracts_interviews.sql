-- Phase B3b of the redesign spec: offer deadlines, contract signing and
-- interview scheduling.
--
-- 1. Offers have a deadline. A talent can't accept an offer after it;
--    the employer can send a new one. Offers already waiting get 7 days
--    from today, so nobody's open offer lapses the moment this ships.
-- 2. "Contract to sign": each side confirms the written terms (0096)
--    of their contract. Signing records which version and its
--    fingerprint, so what was agreed is provable later.
-- 3. "Interview scheduling": the employer (or staff, on staff-assisted
--    roles) offers 2–5 time slots; the talent picks one, which moves the
--    application to the interview stage. Reminders go out 24 h and 1 h
--    before. Times are stored in UTC and shown in each person's own
--    timezone by the app.
--
-- Safe to re-run. Run AFTER 0112.

-- ---------------------------------------------------------------------
-- 1. Offer deadlines.
-- ---------------------------------------------------------------------
alter table offers add column if not exists expires_at timestamptz;
update offers set expires_at = now() + interval '7 days' where expires_at is null and status = 'sent';

create or replace function offers_set_and_guard_expiry()
returns trigger language plpgsql as $$
begin
  -- Every offer that goes out gets a deadline (7 days unless set).
  if new.status = 'sent' and new.expires_at is null then
    new.expires_at := now() + interval '7 days';
  end if;
  if tg_op = 'UPDATE' and old.status = 'sent' and new.status = 'accepted'
     and old.expires_at is not null and old.expires_at < now() then
    raise exception 'This offer has expired. Ask the employer to send a new one.' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists offers_set_and_guard_expiry on offers;
create trigger offers_set_and_guard_expiry before insert or update on offers
  for each row execute function offers_set_and_guard_expiry();

-- ---------------------------------------------------------------------
-- 2. Contract signatures.
-- ---------------------------------------------------------------------
create table if not exists contract_signatures (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts(id) on delete cascade,
  terms_version int not null,
  content_hash text not null,
  party text not null check (party in ('talent', 'organisation')),
  signed_by uuid references profiles(id) on delete set null,
  signed_at timestamptz not null default now(),
  unique (contract_id, terms_version, party)
);
create index if not exists contract_signatures_contract_idx on contract_signatures(contract_id);

alter table contract_signatures enable row level security;
drop policy if exists contract_signatures_select on contract_signatures;
create policy contract_signatures_select on contract_signatures for select
  using (is_contract_participant(contract_id) or is_staff());
-- Written only through sign_contract() below; never edited or removed.
revoke insert, update, delete on contract_signatures from anon, authenticated;

create or replace function sign_contract(p_contract_id uuid)
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

  select * into v_terms from contract_terms where contract_id = p_contract_id order by version desc limit 1;
  if v_terms.id is null then
    raise exception 'The written terms for this contract are not ready yet. Open the contract page and try again.' using errcode = 'P0002';
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
revoke all on function sign_contract(uuid) from public, anon;
grant execute on function sign_contract(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Interview slots.
-- ---------------------------------------------------------------------
create table if not exists interview_slots (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  starts_at timestamptz not null,
  duration_minutes int not null default 30 check (duration_minutes between 10 and 240),
  mode text not null default 'video' check (mode in ('video', 'phone', 'in_person')),
  details text check (char_length(details) <= 500),
  status text not null default 'offered' check (status in ('offered', 'chosen', 'declined', 'cancelled')),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  reminded_24h_at timestamptz,
  reminded_1h_at timestamptz
);
create index if not exists interview_slots_application_idx on interview_slots(application_id, starts_at);
create index if not exists interview_slots_reminders_idx on interview_slots(starts_at) where status = 'chosen';
-- One chosen slot per application.
create unique index if not exists interview_slots_one_chosen_uidx on interview_slots(application_id) where status = 'chosen';

alter table interview_slots enable row level security;
drop policy if exists interview_slots_select on interview_slots;
create policy interview_slots_select on interview_slots for select using (
  is_staff()
  or exists (
    select 1 from applications a join opportunities o on o.id = a.opportunity_id
    where a.id = interview_slots.application_id
      and (a.talent_id = auth.uid() or is_org_member(o.organisation_id))
  )
);
-- Written only through the functions below.
revoke insert, update, delete on interview_slots from anon, authenticated;

-- The organisation behind an application, if the caller may schedule for it.
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
        or (is_staff() and current_user_role()::text in ('matcher', 'admin'))
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
begin
  if not can_schedule_interview(p_application_id) then
    raise exception 'You can''t schedule interviews for this application.' using errcode = '42501';
  end if;
  select * into v_app from applications where id = p_application_id;
  if v_app.stage not in ('shortlisted', 'interviewing') then
    raise exception 'Shortlist this applicant before offering interview times.' using errcode = '23514';
  end if;
  if v_count < 1 or v_count > 5 then
    raise exception 'Offer between 1 and 5 times.' using errcode = '23514';
  end if;

  -- A new set replaces any times still waiting for an answer; an already
  -- chosen time is cancelled too (this is a reschedule).
  update interview_slots set status = 'cancelled'
   where application_id = p_application_id and status in ('offered', 'chosen');

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
  select * into v_app from applications where id = v_slot.application_id;
  if v_app.id is null or v_app.talent_id is distinct from auth.uid() then
    raise exception 'This interview time isn''t yours to choose.' using errcode = '42501';
  end if;
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
  update interview_slots set status = 'chosen' where id = p_slot_id returning * into v_slot;

  -- Same trusted path the system already uses for stage changes it makes
  -- on someone's behalf (0049/0053/0110): transaction-local, never
  -- settable by a client.
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

-- Reminders: 24 h and 1 h before a chosen time, to the talent and the
-- organisation's representative. Each is sent once.
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
     where s.status = 'chosen' and s.starts_at > now() and s.starts_at <= now() + interval '24 hours'
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

select cron.unschedule(jobid) from cron.job where jobname = 'send-interview-reminders';
select cron.schedule('send-interview-reminders', '*/15 * * * *', 'select send_interview_reminders();');
