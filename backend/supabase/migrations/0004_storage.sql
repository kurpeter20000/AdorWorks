-- AdorWorks — private storage buckets for identity docs, portfolio
-- files and organisation registration evidence.
--
-- Run this AFTER 0003_views_and_triggers.sql. Both buckets are PRIVATE
-- (public = false) — files are only ever reached through a signed URL
-- the backend API issues after checking the caller is allowed to see
-- that specific file, never a public bucket URL.
--
-- Upload path convention (enforced by the policies below):
--   talent-evidence/{talent_id}/{filename}   — talent_id = auth.uid() of the owner
--   org-documents/{organisation_id}/{filename}

insert into storage.buckets (id, name, public)
values ('talent-evidence', 'talent-evidence', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('org-documents', 'org-documents', false)
on conflict (id) do nothing;

-- talent-evidence: owner can manage files inside their own folder; staff
-- can read (and re-organise/delete, for moderation) anything.

drop policy if exists talent_evidence_owner_all on storage.objects;
create policy talent_evidence_owner_all on storage.objects
  for all
  using (
    bucket_id = 'talent-evidence'
    and (auth.uid()::text = (storage.foldername(name))[1] or is_staff())
  )
  with check (
    bucket_id = 'talent-evidence'
    and (auth.uid()::text = (storage.foldername(name))[1] or is_staff())
  );

-- org-documents: same pattern, keyed by the organisation's representative.

drop policy if exists org_documents_owner_all on storage.objects;
create policy org_documents_owner_all on storage.objects
  for all
  using (
    bucket_id = 'org-documents'
    and (
      is_staff()
      or exists (
        select 1 from organisations o
        where o.id::text = (storage.foldername(name))[1]
          and o.representative_id = auth.uid()
      )
    )
  )
  with check (
    bucket_id = 'org-documents'
    and (
      is_staff()
      or exists (
        select 1 from organisations o
        where o.id::text = (storage.foldername(name))[1]
          and o.representative_id = auth.uid()
      )
    )
  );
