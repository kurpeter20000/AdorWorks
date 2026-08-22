-- AdorWorks — storage.objects policy for the 'deliverables' bucket.
--
-- 0006 created the bucket itself but never added a policy for it (only
-- 'talent-evidence' and 'org-documents' got one, in 0004) — found while
-- building deliverable submission in the Next.js app. Without a policy,
-- storage.objects' RLS (already enabled project-wide since 0004) denies
-- everyone by default, so no one could actually upload or read a
-- deliverable file. This isn't a security gap like 0008/0010/0011 —
-- it's the opposite direction, a missing grant that made the feature
-- non-functional — but it's the same "read the actual RLS, don't
-- assume" discipline that found those.
--
-- Upload path convention: deliverables/{contract_id}/{filename}
--
-- Run this AFTER 0011_tighten_offers_and_contracts.sql.

drop policy if exists deliverables_participant_all on storage.objects;
create policy deliverables_participant_all on storage.objects
  for all
  using (
    bucket_id = 'deliverables'
    and (is_staff() or is_contract_participant(((storage.foldername(name))[1])::uuid))
  )
  with check (
    bucket_id = 'deliverables'
    and (is_staff() or is_contract_participant(((storage.foldername(name))[1])::uuid))
  );
