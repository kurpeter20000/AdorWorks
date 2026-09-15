-- AdorWorks — S06-05: a real team-invitation lifecycle.
--
-- Gap found in the 2026-09-15 audit: inviteTeamMember immediately created
-- (or found) an account and upserted an organisation_members row — there
-- was no pending state to expire, and a repeat invite to the same email
-- just upserted the same membership row instead of being rejected as
-- reused. This table gives invitations a real lifecycle: pending, with a
-- token and an expiry, accepted exactly once, and superseded (not
-- duplicated) by a fresh invite to the same email.
--
-- Deliberately mirrors 0050_employer_invitations.sql's shape (separate
-- table, token-based accept via a server action using the admin client,
-- not RLS) rather than adding yet another status enum onto
-- organisation_members itself.
--
-- Run this AFTER 0074_shortlist_removal.sql.

create table if not exists organisation_team_invitations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('member', 'admin', 'recruiter', 'hiring_manager', 'finance', 'viewer')),
  token uuid not null default gen_random_uuid(),
  invited_by uuid not null references profiles(id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_by uuid references profiles(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (token)
);

create index if not exists organisation_team_invitations_org_idx on organisation_team_invitations(organisation_id);
create index if not exists organisation_team_invitations_email_idx on organisation_team_invitations(lower(email));

alter table organisation_team_invitations enable row level security;

-- Only org admins (and staff) can see or create invitations for their own
-- organisation — the invitee doesn't need RLS visibility, since acceptance
-- goes through a server action using the admin client after an explicit
-- token + email-match check (same reasoning 0050 used for talent
-- accept/decline).
drop policy if exists organisation_team_invitations_select on organisation_team_invitations;
create policy organisation_team_invitations_select on organisation_team_invitations for select
  using (is_staff() or is_org_admin(organisation_id));

drop policy if exists organisation_team_invitations_insert on organisation_team_invitations;
create policy organisation_team_invitations_insert on organisation_team_invitations for insert
  with check (invited_by = auth.uid() and (is_staff() or is_org_admin(organisation_id)));

-- Revoking (status -> 'revoked') goes through the same admins; acceptance
-- itself is admin-client-only (no update policy needed for the invitee).
drop policy if exists organisation_team_invitations_update on organisation_team_invitations;
create policy organisation_team_invitations_update on organisation_team_invitations for update
  using (is_staff() or is_org_admin(organisation_id))
  with check (is_staff() or is_org_admin(organisation_id));

-- Rollback: drop table organisation_team_invitations.
