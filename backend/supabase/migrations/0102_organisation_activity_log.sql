-- AdorWorks — organisation activity log: what a team's own members have
-- done, visible to the whole team instead of only the person who did it.
--
-- audit_events (0035) has no organisation_id column — it's a generic
-- entity_type/entity_id log, and is_staff()-only for select. Rather than
-- widen that table's RLS (audit_events spans every actor on the
-- platform, not just one org's own activity — a blanket "any org member
-- can read audit_events" policy would need to reconstruct the same
-- per-entity-type scoping anyway, so it isn't actually simpler), this is
-- a security-definer function that resolves the caller's own org via
-- organisation_members, then unions the subset of entity types that are
-- genuinely "things my organisation did": opportunities, offers,
-- contracts, milestones, team invitations and membership changes.
-- Deliberately narrower than the full audit vocabulary (events.ts) —
-- application-stage churn and payment_events are high-volume and/or
-- already visible elsewhere (the Finance overview, 0101), so they're
-- left out to keep this an actual "what happened" feed, not a firehose.
--
-- Rollback: drop function if exists organisation_activity_log(int);

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
  select cd.id, cd.name, cd.occurred_at, p.full_name, coalesce(p.role in ('reviewer', 'matcher', 'finance', 'admin'), false), cd.entity_type, cd.entity_id, cd.metadata
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
