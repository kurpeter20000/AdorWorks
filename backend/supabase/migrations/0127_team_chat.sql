-- Team chat (owner, 2026-11-22): internal group messaging, separate from
-- the employer↔talent conversations (0006/0098).
--
--   organisation  An employer's own team channels. Only that
--                 organisation's members can read or post — never talent,
--                 never other employers. Candidate discussions reuse the
--                 existing per-applicant notes (application_notes, 0052),
--                 so the applicant card and the chat show the same thread.
--   staff         AdorWorks staff channels (every staff role, with MFA).
--   programme     Per Pathways cohort: a "cohort" channel for participants,
--                 facilitators, the partner's people and AdorWorks staff,
--                 and a "team" channel for everyone except participants.
--                 Group channels only — no private messages — because
--                 cohorts can include under-18s. AdorWorks staff can always
--                 read programme channels, and moderators can hide a
--                 message. Contact details are blocked in cohort channels
--                 by the app (lib/domain/messageFilter.ts).
--
-- Safe to re-run. Run AFTER 0126.

create table if not exists team_channels (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('organisation', 'staff', 'programme')),
  kind text not null default 'general' check (kind in ('general', 'cohort', 'team')),
  organisation_id uuid references organisations(id) on delete cascade,
  programme_id uuid references programmes(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  description text check (description is null or char_length(description) <= 200),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint team_channels_scope check (
    (scope = 'organisation' and organisation_id is not null and programme_id is null and kind = 'general')
    or (scope = 'staff' and organisation_id is null and programme_id is null and kind = 'general')
    or (scope = 'programme' and programme_id is not null and organisation_id is null and kind in ('cohort', 'team'))
  )
);

create unique index if not exists team_channels_programme_kind on team_channels(programme_id, kind) where scope = 'programme';
create unique index if not exists team_channels_org_name on team_channels(organisation_id, lower(name)) where scope = 'organisation';
create unique index if not exists team_channels_staff_name on team_channels(lower(name)) where scope = 'staff';

create table if not exists team_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references team_channels(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  body text not null check (char_length(body) between 1 and 4000),
  -- Employer channels: "shared a candidate" card linking to an applicant.
  application_id uuid references applications(id) on delete set null,
  hidden_at timestamptz,
  hidden_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists team_messages_channel_idx on team_messages(channel_id, created_at desc);

-- Where each person has read up to, per thread ("c:<channel id>" or
-- "a:<application id>" for a candidate discussion).
create table if not exists team_chat_reads (
  user_id uuid not null references profiles(id) on delete cascade,
  thread_key text not null check (char_length(thread_key) <= 80),
  last_read_at timestamptz not null default now(),
  primary key (user_id, thread_key)
);

-- Access ------------------------------------------------------------------

create or replace function is_adorworks_staff_member()
returns boolean
language sql stable security definer set search_path = public
as $$
  select is_staff_role(current_user_role()::text) and staff_session_ok();
$$;

create or replace function can_read_team_channel(cid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from team_channels c
    where c.id = cid and (
      (c.scope = 'organisation' and is_org_member(c.organisation_id))
      or (c.scope = 'staff' and is_adorworks_staff_member())
      or (c.scope = 'programme' and (
        is_staff()
        or exists (select 1 from programme_partner_users p where p.programme_id = c.programme_id and p.user_id = auth.uid())
        or exists (select 1 from programme_facilitators f where f.programme_id = c.programme_id and f.user_id = auth.uid())
        or exists (
          select 1 from programmes g
          where g.id = c.programme_id and g.partner_organisation_id is not null and is_org_member(g.partner_organisation_id)
        )
        or (c.kind = 'cohort' and exists (
          select 1 from programme_members m where m.programme_id = c.programme_id and m.talent_id = auth.uid()
        ))
      ))
    )
  );
$$;

-- Posting: readers may post, unless the channel is archived; a candidate
-- card must point at an applicant to this same organisation's job.
create or replace function can_post_team_message(cid uuid, app_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select can_read_team_channel(cid)
    and exists (select 1 from team_channels c where c.id = cid and c.archived_at is null)
    and (
      app_id is null
      or exists (
        select 1 from team_channels c
        join applications a on a.id = app_id
        join opportunities o on o.id = a.opportunity_id
        where c.id = cid and c.scope = 'organisation' and o.organisation_id = c.organisation_id
      )
    );
$$;

alter table team_channels enable row level security;
drop policy if exists team_channels_select on team_channels;
create policy team_channels_select on team_channels for select using (can_read_team_channel(id));
-- Channels are created by the app's service layer after its own checks.

alter table team_messages enable row level security;
drop policy if exists team_messages_select on team_messages;
create policy team_messages_select on team_messages for select using (can_read_team_channel(channel_id));
drop policy if exists team_messages_insert on team_messages;
create policy team_messages_insert on team_messages for insert
  with check (sender_id = auth.uid() and hidden_at is null and hidden_by is null and can_post_team_message(channel_id, application_id));
-- No update/delete: messages are a record. Moderators hide via the app's
-- service layer (hidden_at), which keeps the row for safeguarding.

alter table team_chat_reads enable row level security;
drop policy if exists team_chat_reads_owner on team_chat_reads;
create policy team_chat_reads_owner on team_chat_reads for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Every cohort gets its two channels, now and for new cohorts ---------------

create or replace function create_programme_team_channels()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into team_channels (scope, kind, programme_id, name, description)
  values
    ('programme', 'cohort', new.id, 'Cohort chat', 'Participants, facilitators and staff'),
    ('programme', 'team', new.id, 'Team chat', 'Facilitators, partner staff and AdorWorks')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists programmes_team_channels on programmes;
create trigger programmes_team_channels after insert on programmes
  for each row execute function create_programme_team_channels();

insert into team_channels (scope, kind, programme_id, name, description)
select 'programme', k.kind, p.id, k.name, k.description
from programmes p
cross join (values
  ('cohort', 'Cohort chat', 'Participants, facilitators and staff'),
  ('team', 'Team chat', 'Facilitators, partner staff and AdorWorks')
) as k(kind, name, description)
on conflict do nothing;

-- AdorWorks staff channels
insert into team_channels (scope, name, description)
values
  ('staff', 'General', 'Everyone at AdorWorks'),
  ('staff', 'Talent & verification', 'Evidence, tiers and talent questions'),
  ('staff', 'Employers & jobs', 'Organisations, briefs and shortlists'),
  ('staff', 'Payments & finance', 'Payouts, invoices and reconciliation'),
  ('staff', 'Pathways', 'Cohorts, partners and sessions')
on conflict do nothing;

-- Live updates (RLS still decides who receives each row) --------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'team_messages') then
    alter publication supabase_realtime add table team_messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'application_notes') then
    alter publication supabase_realtime add table application_notes;
  end if;
end $$;

-- Rollback:
--   alter publication supabase_realtime drop table team_messages;
--   alter publication supabase_realtime drop table application_notes;
--   drop trigger if exists programmes_team_channels on programmes;
--   drop function if exists create_programme_team_channels();
--   drop table if exists team_chat_reads; drop table if exists team_messages; drop table if exists team_channels;
--   drop function if exists can_post_team_message(uuid, uuid); drop function if exists can_read_team_channel(uuid);
--   drop function if exists is_adorworks_staff_member();
