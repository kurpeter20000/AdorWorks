-- AdorWorks — Stage 6 (employer/organisation dashboard) gap-check fixes.
--
-- Three real gaps found in the 2026-09-15 audit:
--
-- 1. S06-02: the public /opportunities list queries organisations with the
--    RLS-gated client as a talent session — organisations_select never
--    allowed that (representative_id/is_staff/is_org_member only), so real
--    employer names silently fell back to a generic placeholder for
--    effectively every listing. Fix: a narrow public view exposing only
--    id/name/verification_status, same pattern as public_talent_profiles
--    (0034) — never address, billing email, or registration evidence.
--
-- 2. S06-02/S06-03: organisations_update RLS and the org-documents storage
--    policy were both still keyed to representative_id only (0002/0020),
--    so an invited org_admin teammate could not edit org details, logo, or
--    verification evidence at all — despite is_org_admin() (0007) existing
--    and already covering exactly this case for organisation_members and
--    opportunities. Widened to match.
--
-- 3. S06-03: verification_checks_select was scoped to is_org_representative
--    only, so an invited teammate could not even see verification status.
--    Widened to is_org_member — any teammate can see status; responding to
--    an information request/appeal stays admin-only (enforced in code,
--    submitVerificationInfo, updated in the same commit as this migration).
--
-- Run this AFTER 0071_verified_employer_capability_boundaries.sql.

create or replace view public_organisation_names as
select id, name, verification_status
from organisations;

grant select on public_organisation_names to anon, authenticated;

drop policy if exists organisations_update on organisations;
create policy organisations_update on organisations for update
  using (representative_id = auth.uid() or is_org_admin(id) or is_staff())
  with check (representative_id = auth.uid() or is_org_admin(id) or is_staff());

drop policy if exists org_documents_owner_all on storage.objects;
create policy org_documents_owner_all on storage.objects
  for all
  using (
    bucket_id = 'org-documents'
    and (is_staff() or is_org_admin(((storage.foldername(name))[1])::uuid))
  )
  with check (
    bucket_id = 'org-documents'
    and (is_staff() or is_org_admin(((storage.foldername(name))[1])::uuid))
  );

drop policy if exists verification_checks_select on verification_checks;
create policy verification_checks_select on verification_checks for select
  using (is_staff() or is_org_member(organisation_id));

-- Rollback: drop view public_organisation_names; recreate organisations_update
-- with only representative_id = auth.uid() or is_staff(); recreate
-- org_documents_owner_all with is_org_representative(); recreate
-- verification_checks_select with is_org_representative().
