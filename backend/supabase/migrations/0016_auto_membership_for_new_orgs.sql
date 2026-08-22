-- AdorWorks — the actual root cause behind 0014/0015: is_org_member()
-- (0007) is used across offers_select/insert/update, contracts_select,
-- screening_questions/screening_answers RLS — anywhere an org's own
-- staff needs read/write access. It checks organisation_members, whose
-- ONLY population source was 0005's one-time backfill for organisations
-- that existed at that moment:
--
--   insert into organisation_members (organisation_id, user_id, role)
--   select id, representative_id, 'admin' from organisations
--
-- Every organisation created since then — i.e. every self-service
-- organisation created through platform/src/lib/actions/organisation.ts
-- (createOrganisation) — never gets a matching organisation_members row,
-- because that Server Action only ever sets organisations.
-- representative_id. So is_org_member() has been false for exactly the
-- orgs it matters for, since the self-service flow was built. This is
-- the same underlying gap 0014 hit for talent_profiles_select (fixed in
-- 0015 by switching to is_org_representative there) — but that was one
-- symptom of a wider problem, not the only one. offers_select,
-- contracts_select and the screening_* policies all still depend on
-- is_org_member and are still affected.
--
-- Fix at the source instead of patching every policy individually: a
-- trigger that keeps 0005's backfill invariant ("the representative is
-- always also a member") true for every organisation from now on,
-- regardless of which code path creates it.
--
-- Run this AFTER 0015_fix_talent_visibility_helper.sql.

create or replace function add_representative_as_org_member()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into organisation_members (organisation_id, user_id, role)
  values (new.id, new.representative_id, 'admin')
  on conflict (organisation_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists auto_add_org_representative_as_member on organisations;
create trigger auto_add_org_representative_as_member
  after insert on organisations
  for each row execute function add_representative_as_org_member();

-- Backfill any organisations created between 0005 and this migration
-- (i.e. through the self-service flow, before this trigger existed).
insert into organisation_members (organisation_id, user_id, role)
select id, representative_id, 'admin' from organisations
on conflict (organisation_id, user_id) do nothing;
