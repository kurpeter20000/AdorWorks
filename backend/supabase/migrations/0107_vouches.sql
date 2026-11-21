-- Vouches — a digitized version of the personal referral/word-of-mouth
-- that actually dominates hiring in this market (see the 2026-11 pain-point
-- research in the project's own planning notes): a talent asks an
-- EXISTING AdorWorks account — someone who already knows them personally,
-- not a stranger — to vouch for them. The voucher must actively confirm
-- (not just be named), the same way a real reference only counts once the
-- person actually answers for you. Distinct from talent_evidence's
-- 'reference' type (an uploaded, staff-reviewed document) — this is an
-- in-network, person-to-person trust signal with no file involved.
create table if not exists vouches (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references talent_profiles(id) on delete cascade,
  voucher_id uuid not null references profiles(id) on delete cascade,
  relationship text not null,
  statement text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint vouches_not_self check (voucher_id <> talent_id),
  unique (talent_id, voucher_id)
);
create index if not exists vouches_talent_idx on vouches(talent_id);
create index if not exists vouches_voucher_idx on vouches(voucher_id);

alter table vouches enable row level security;

-- The talent sees every request they've sent (any status); the voucher
-- sees every request addressed to them; a confirmed vouch is public (it's
-- meant to show on the talent's public Passport); staff see everything,
-- same as reports.
drop policy if exists vouches_select on vouches;
create policy vouches_select on vouches for select
  using (talent_id = auth.uid() or voucher_id = auth.uid() or status = 'confirmed' or is_staff());

-- A talent can request a vouch for themselves only, starting pending —
-- the actual email-to-account lookup happens server-side (requestVouch,
-- lib/actions/vouches.ts) via the admin client, same reason
-- inviteTeamMember (organisationTeam.ts) needs admin.auth.admin.listUsers.
drop policy if exists vouches_insert on vouches;
create policy vouches_insert on vouches for insert
  with check (talent_id = auth.uid() and status = 'pending');

-- Only the named voucher can respond, and only once.
drop policy if exists vouches_voucher_update on vouches;
create policy vouches_voucher_update on vouches for update
  using (voucher_id = auth.uid() and status = 'pending')
  with check (voucher_id = auth.uid());

-- Staff moderate (e.g. remove a vouch upheld as abusive via the reports
-- queue) the same way they moderate everything else reportable.
drop policy if exists vouches_staff_update on vouches;
create policy vouches_staff_update on vouches for update
  using (is_staff())
  with check (is_staff());
drop policy if exists vouches_staff_delete on vouches;
create policy vouches_staff_delete on vouches for delete
  using (is_staff());

-- A voucher who isn't the talent, staff, or already connected needs to
-- see WHO is asking them to vouch — but profiles_select (0002) only
-- admits id = auth.uid() or is_staff(), so a plain join to profiles
-- would silently return nothing. Same security_invoker-view-over-a-
-- narrow-security-definer-function idiom as public_organisation_names
-- (0095) — but deliberately NOT granted to anon: profiles.full_name is
-- the account's real name, not an opted-into-public identity like
-- talent_profiles.display_name or an organisation's name. This is for
-- "the one specific person a request was addressed to" (same as
-- public_organisation_names's actual use in invitations.ts), never for
-- anonymous visitors — the public Passport page below shows a
-- confirmed vouch's relationship/statement only, the same name-free
-- pattern reviews already use (reviewer_role, never the reviewer's name).
create or replace function public.public_profile_names_rows()
returns table (id uuid, full_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name from public.profiles p;
$$;

revoke all on function public.public_profile_names_rows() from public;
grant execute on function public.public_profile_names_rows() to authenticated;

create or replace view public_profile_names
  with (security_invoker = true)
as
select id, full_name from public.public_profile_names_rows();

grant select on public_profile_names to authenticated;

-- Reportable like any other piece of trust-bearing content on the
-- platform (0047) — lets staff route a bad-faith or fake vouch through
-- the same reports queue everything else uses, instead of a bespoke flow.
alter table reports drop constraint if exists reports_target_type_check;
alter table reports add constraint reports_target_type_check
  check (target_type in ('opportunity', 'talent_service', 'talent_profile', 'organisation', 'talent_video', 'portfolio_item', 'vouch'));

-- Rollback (Stage 10 policy: literal, executable):
--   alter table reports drop constraint if exists reports_target_type_check;
--   alter table reports add constraint reports_target_type_check
--     check (target_type in ('opportunity', 'talent_service', 'talent_profile', 'organisation', 'talent_video', 'portfolio_item'));
--   drop table if exists vouches;
--   drop view if exists public_profile_names;
--   drop function if exists public.public_profile_names_rows();
