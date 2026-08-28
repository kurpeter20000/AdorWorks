-- AdorWorks — Stage 5: structured scorecards and interview scheduling.
--
-- The only evaluation signal before this was a single freeform
-- suitability_score numeric column — not comparable across reviewers or
-- candidates. This adds a fixed, small set of named criteria (fixed
-- rather than employer-defined, so scores stay comparable candidate-to-
-- candidate and don't need a criteria-management UI) that any number of
-- an org's team members can each score independently — the point being
-- collaboration and comparison, not a single gatekeeper's opinion.
--
-- Run this AFTER 0050_employer_invitations.sql.

create table if not exists application_scorecards (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  criterion text not null check (criterion in ('skill_fit', 'communication', 'portfolio_quality', 'reliability')),
  score smallint not null check (score between 1 and 5),
  note text,
  scored_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, criterion, scored_by)
);

create index if not exists application_scorecards_application_idx on application_scorecards(application_id);

alter table application_scorecards enable row level security;

drop policy if exists application_scorecards_select on application_scorecards;
create policy application_scorecards_select on application_scorecards for select
  using (
    is_staff()
    or exists (
      select 1 from applications a
      join opportunities o on o.id = a.opportunity_id
      where a.id = application_id and is_org_write_member(o.organisation_id)
    )
  );

-- Each reviewer only ever owns their own row per (application, criterion)
-- — the unique constraint above is what lets several teammates' scores
-- coexist instead of overwriting each other.
drop policy if exists application_scorecards_write on application_scorecards;
create policy application_scorecards_write on application_scorecards for all
  using (
    scored_by = auth.uid()
    and exists (
      select 1 from applications a
      join opportunities o on o.id = a.opportunity_id
      where a.id = application_id and is_org_write_member(o.organisation_id)
    )
  )
  with check (
    scored_by = auth.uid()
    and exists (
      select 1 from applications a
      join opportunities o on o.id = a.opportunity_id
      where a.id = application_id and is_org_write_member(o.organisation_id)
    )
  );

-- Single-round interview scheduling/notes, directly on applications
-- (not a separate interviews table — no multi-round scheduling need has
-- come up yet, and this is simpler to build on top of than a child
-- table). Editable by any org write-member of the opportunity, in any
-- shortlisting_mode, since interview coordination is useful regardless of
-- who does the shortlisting.
alter table applications add column if not exists interview_scheduled_at timestamptz;
alter table applications add column if not exists interview_notes text;

drop policy if exists applications_update_employer_interview on applications;
create policy applications_update_employer_interview on applications for update
  using (
    exists (select 1 from opportunities o where o.id = applications.opportunity_id and is_org_write_member(o.organisation_id))
  )
  with check (
    exists (select 1 from opportunities o where o.id = applications.opportunity_id and is_org_write_member(o.organisation_id))
  );

-- Rollback: drop table application_scorecards; drop policy
-- applications_update_employer_interview; drop columns
-- interview_scheduled_at, interview_notes from applications.
