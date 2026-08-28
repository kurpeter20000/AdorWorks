-- AdorWorks — Stage 5: employer invitations and talent accept/decline.
--
-- Deliberately separate from Stage 4's addCandidateToShortlist (which
-- silently enrolls a self-service employer's chosen candidate straight
-- onto the shortlist, no consent step) — an invitation is real outreach:
-- the employer proposes, the talent decides. Only on acceptance does a
-- real `applications` row get created, via the accompanying server
-- action's admin-client + explicit ownership/status check (same pattern
-- as offers.ts's acceptOffer/declineOffer), not via RLS/a trigger here —
-- keeps this migration's surface small.
--
-- Run this AFTER 0049_application_withdrawal.sql.

create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  talent_id uuid not null references talent_profiles(id) on delete cascade,
  invited_by uuid not null references profiles(id),
  message text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired')),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (opportunity_id, talent_id)
);

create index if not exists invitations_talent_idx on invitations(talent_id);
create index if not exists invitations_opportunity_idx on invitations(opportunity_id);

alter table invitations enable row level security;

drop policy if exists invitations_select on invitations;
create policy invitations_select on invitations for select
  using (
    talent_id = auth.uid()
    or is_staff()
    or exists (
      select 1 from opportunities o where o.id = opportunity_id and is_org_write_member(o.organisation_id)
    )
  );

-- Any org write-member can invite talent to their own opportunity — not
-- limited to self-service (unlike Stage 4's shortlist search): inviting
-- is just outreach, the talent still has to say yes.
drop policy if exists invitations_insert on invitations;
create policy invitations_insert on invitations for insert
  with check (
    invited_by = auth.uid()
    and (
      is_staff()
      or exists (
        select 1 from opportunities o where o.id = opportunity_id and is_org_write_member(o.organisation_id)
      )
    )
  );

-- Talent accept/decline goes through a server action using the admin
-- client after an explicit ownership + status check (see
-- lib/actions/invitations.ts), same as offers.ts — no talent update
-- policy needed here. Staff retain full access for support/correction.
drop policy if exists invitations_staff_all on invitations;
create policy invitations_staff_all on invitations for all
  using (is_staff())
  with check (is_staff());

-- Widen applications.source so an accepted invitation can create a real
-- application without pretending it was 'applied' (talent-initiated) or
-- 'matched' (someone else added them without asking).
alter table applications drop constraint if exists applications_source_check;
alter table applications add constraint applications_source_check check (source in ('applied', 'matched', 'invited'));

-- Rollback: drop table invitations; recreate applications_source_check
-- with only ('applied', 'matched').
