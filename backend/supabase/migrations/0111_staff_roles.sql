-- Phase B2 of the redesign spec (decision confirmed by the owner on
-- 2026-11-16): six staff roles, each seeing only its own queues.
--
--   reviewer       opportunities, services, intake          (existing)
--   verifier       talent and organisation verification     (new)
--   trust_safety   reports, disputes, support               (new)
--   finance        payouts, invoices, contracts, settings   (existing)
--   field_support  assisted onboarding, support             (new)
--   admin          everything                                (existing)
--
-- The existing 'matcher' role stays: it builds shortlists and runs
-- engagements. Which pages and API routes each role may use is decided
-- in the app (platform/src/lib/domain/staffAccess.ts) and the staff API
-- (backend/api/src/middleware/staffAccess.js). Here the database only
-- has to know the new roles are staff: they need MFA like every other
-- staff role, and the employer activity feed must show them as
-- "AdorWorks", never by name.
--
-- The new roles are compared as text below on purpose: Postgres won't
-- let a new enum value be used in the same transaction that adds it,
-- and the Supabase SQL Editor runs this whole file as one transaction.
--
-- Safe to re-run. Run AFTER 0110.

alter type user_role add value if not exists 'verifier';
alter type user_role add value if not exists 'trust_safety';
alter type user_role add value if not exists 'field_support';

-- One list of staff roles for the database.
create or replace function is_staff_role(p_role text)
returns boolean
language sql immutable
as $$
  select coalesce(p_role in ('reviewer', 'verifier', 'trust_safety', 'finance', 'field_support', 'matcher', 'admin'), false);
$$;

-- Same as 0109 (MFA + active account required), with the new roles.
create or replace function is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select is_staff_role(current_user_role()::text) and staff_session_ok();
$$;

-- 0102's employer activity feed, unchanged except that staff are now
-- recognised through is_staff_role(), so a verifier's or trust & safety
-- decision shows as "AdorWorks" like every other staff action.
create or replace function organisation_activity_log(p_limit int default 50)
returns table (
  id uuid,
  name text,
  occurred_at timestamptz,
  actor_name text,
  -- Some logged actions (opportunity moderation decisions, dispute
  -- resolutions) are performed by AdorWorks staff, not a teammate —
  -- flagged here so the UI can show "AdorWorks" rather than a staff
  -- member's real name, the same privacy line already drawn for staff
  -- elsewhere (e.g. dispute resolutions show "AdorWorks resolution",
  -- never which staff member decided it).
  actor_is_staff boolean,
  entity_type text,
  entity_id text,
  metadata jsonb
)
language plpgsql stable security definer set search_path = public
as $$
declare
  my_org_id uuid;
begin
  select organisation_id into my_org_id from organisation_members where user_id = auth.uid() limit 1;
  if my_org_id is null then
    return;
  end if;

  -- Pre-filtered to only the entity types this function knows how to
  -- resolve, in its own CTE, before any entity_id::uuid cast is
  -- attempted — audit_events.entity_id is a generic text column, and
  -- some entity types that actually occur in the table (e.g.
  -- 'platform_settings', entity_id='fees') aren't uuids at all. A single
  -- WHERE clause mixing the entity_type check and the cast in one OR
  -- chain doesn't guarantee Postgres evaluates them in that order, so a
  -- non-uuid row from an unrelated entity_type could still hit the cast.
  -- Scoping to known-uuid entity types first removes that risk entirely
  -- rather than relying on evaluation order.
  return query
  with candidates as (
    select ae.id, ae.name, ae.occurred_at, ae.actor_id, ae.entity_type, ae.entity_id, ae.metadata, ae.entity_id::uuid as entity_uuid
    from audit_events ae
    where ae.entity_type in ('opportunities', 'offers', 'contracts', 'milestones', 'organisation_team_invitations', 'organisation_members')
  )
  select cd.id, cd.name, cd.occurred_at, p.full_name, is_staff_role(p.role::text), cd.entity_type, cd.entity_id, cd.metadata
  from candidates cd
  left join profiles p on p.id = cd.actor_id
  where
    (cd.entity_type = 'opportunities' and exists (
      select 1 from opportunities o where o.id = cd.entity_uuid and o.organisation_id = my_org_id
    ))
    or (cd.entity_type = 'offers' and exists (
      select 1 from offers off where off.id = cd.entity_uuid and off.organisation_id = my_org_id
    ))
    or (cd.entity_type = 'contracts' and exists (
      select 1 from contracts c where c.id = cd.entity_uuid and c.organisation_id = my_org_id
    ))
    or (cd.entity_type = 'milestones' and exists (
      select 1 from milestones m join contracts c on c.id = m.contract_id
      where m.id = cd.entity_uuid and c.organisation_id = my_org_id
    ))
    or (cd.entity_type = 'organisation_team_invitations' and exists (
      select 1 from organisation_team_invitations oti where oti.id = cd.entity_uuid and oti.organisation_id = my_org_id
    ))
    or (cd.entity_type = 'organisation_members' and exists (
      select 1 from organisation_members om where om.id = cd.entity_uuid and om.organisation_id = my_org_id
    ))
  order by cd.occurred_at desc
  limit p_limit;
end;
$$;

grant execute on function organisation_activity_log(int) to authenticated;
