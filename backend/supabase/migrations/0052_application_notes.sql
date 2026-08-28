-- AdorWorks — Stage 5: shared per-candidate notes for employer team
-- collaboration. Scoped narrowly per the approved decision: any org
-- write-member can see and add notes on their org's applications; this
-- does NOT differentiate recruiter/hiring_manager/finance from each
-- other (that stays the same documented limitation as 0039/Stage 2 —
-- not reopened here).
--
-- A dedicated append-only table rather than reusing applications.notes
-- (a single freeform column already used for the staff-console stage-
-- correction note) — several teammates need their own attributed,
-- timestamped entries, not one shared value that the next person's edit
-- silently overwrites.
--
-- Run this AFTER 0051_application_scorecards_and_interviews.sql.

create table if not exists application_notes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  author_id uuid not null references profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists application_notes_application_idx on application_notes(application_id);

alter table application_notes enable row level security;

drop policy if exists application_notes_select on application_notes;
create policy application_notes_select on application_notes for select
  using (
    is_staff()
    or exists (
      select 1 from applications a
      join opportunities o on o.id = a.opportunity_id
      where a.id = application_id and is_org_write_member(o.organisation_id)
    )
  );

-- Append-only by design — no update/delete policy for anyone, including
-- staff, same as this schema's other audit-adjacent tables (audit_events,
-- verification_events): a note is a timestamped record of what someone
-- said at the time, not a shared editable field.
drop policy if exists application_notes_insert on application_notes;
create policy application_notes_insert on application_notes for insert
  with check (
    author_id = auth.uid()
    and (
      is_staff()
      or exists (
        select 1 from applications a
        join opportunities o on o.id = a.opportunity_id
        where a.id = application_id and is_org_write_member(o.organisation_id)
      )
    )
  );

-- Rollback: drop table application_notes.
