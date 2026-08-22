-- AdorWorks — three RLS gaps found while testing the new team-permissions
-- and verification-evidence features. All three are the same underlying
-- shape: organisations-related policies written before
-- organisation_members existed (0005) still only check
-- representative_id/is_staff(), not is_org_member()/is_org_representative()
-- — so an invited teammate (or, for the storage case, even the
-- representative) hits a wall the rest of the schema already accounts for.

-- ---------------------------------------------------------------------
-- 1. organisations_select didn't recognise team members at all.
--
-- Confirmed directly: an invited member could read their own
-- organisation_members row (organisation_id, role) but a follow-up read
-- of organisations by that id came back null — silently filtered by RLS,
-- not an error. Every other org-scoped table (opportunities, applications,
-- engagements) already checks is_org_member()/is_org_representative();
-- organisations itself never got the same treatment.
-- ---------------------------------------------------------------------

drop policy if exists organisations_select on organisations;
create policy organisations_select on organisations for select
  using (representative_id = auth.uid() or is_staff() or is_org_member(id));

-- ---------------------------------------------------------------------
-- 2. opportunities_select/insert/update: same narrow-representative
-- gap, and the more consequential one — this is what "team members can
-- manage opportunities" actually depends on. 0002 wrote these against
-- is_org_representative() before organisation_members existed (0005) and
-- they were never retrofitted, unlike offers/contracts/screening_* (0007),
-- which already use is_org_member(). Without this, an invited member
-- can't see their own org's draft/pending_review opportunities (only
-- already-public ones, same as a stranger), can't post new ones, and
-- can't edit existing ones.
-- ---------------------------------------------------------------------

drop policy if exists opportunities_select on opportunities;
create policy opportunities_select on opportunities for select
  using (
    is_org_member(organisation_id)
    or is_staff()
    or (status = 'open' and visibility = 'public')
  );

drop policy if exists opportunities_insert on opportunities;
create policy opportunities_insert on opportunities for insert
  with check (is_org_member(organisation_id) or is_staff());

drop policy if exists opportunities_update on opportunities;
create policy opportunities_update on opportunities for update
  using (is_org_member(organisation_id) or is_staff())
  with check (is_org_member(organisation_id) or is_staff());

-- ---------------------------------------------------------------------
-- 3. org-documents storage policy: a raw correlated subquery against
-- organisations (itself RLS-protected) from within storage.objects'
-- policy, instead of the security-definer helper pattern used everywhere
-- else for cross-table RLS checks in this project.
--
-- Found by testing evidence upload: the org's own representative got
-- "new row violates row-level security policy" even though
-- representative_id = auth.uid() for that exact org. Confirmed staff
-- (the is_staff() branch) could upload fine, and the representative could
-- read their own organisations row via a plain query — so the failure was
-- specific to evaluating this inline subquery from inside another
-- table's policy:
--
--   exists (
--     select 1 from organisations o
--     where o.id::text = (storage.foldername(name))[1]
--       and o.representative_id = auth.uid()
--   )
--
-- is_org_representative(org_id uuid) (0002) already exists, is already
-- used successfully in opportunities/applications/engagements RLS, and
-- runs security definer (bypassing organisations' own RLS internally,
-- which is what actually avoids whatever interaction breaks the raw
-- subquery form) — this just applies the same fix here.
-- ---------------------------------------------------------------------

drop policy if exists org_documents_owner_all on storage.objects;
create policy org_documents_owner_all on storage.objects
  for all
  using (
    bucket_id = 'org-documents'
    and (is_staff() or is_org_representative(((storage.foldername(name))[1])::uuid))
  )
  with check (
    bucket_id = 'org-documents'
    and (is_staff() or is_org_representative(((storage.foldername(name))[1])::uuid))
  );
