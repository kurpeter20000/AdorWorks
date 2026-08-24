-- AdorWorks — talent headshots and organisation logos.
--
-- Both are public storage buckets (like talent-portfolio from 0018) since
-- they're meant to be freely viewable — a headshot on a public Passport
-- page, a logo next to an organisation's opportunities — unlike the
-- private talent-evidence/org-documents buckets used for verification
-- documents. Policy included in this same migration — a bucket without
-- one silently accepts no writes (see 0012's history).

alter table talent_profiles add column if not exists avatar_path text;
alter table organisations add column if not exists logo_path text;

insert into storage.buckets (id, name, public)
values ('talent-avatars', 'talent-avatars', true)
on conflict (id) do nothing;

drop policy if exists talent_avatars_owner_write on storage.objects;
create policy talent_avatars_owner_write on storage.objects for all
  using (
    bucket_id = 'talent-avatars'
    and ((storage.foldername(name))[1] = auth.uid()::text or is_staff())
  )
  with check (
    bucket_id = 'talent-avatars'
    and ((storage.foldername(name))[1] = auth.uid()::text or is_staff())
  );

insert into storage.buckets (id, name, public)
values ('org-logos', 'org-logos', true)
on conflict (id) do nothing;

-- Same ownership pattern as org-documents, keyed by the organisation's
-- representative — using is_org_representative() (not a raw correlated
-- subquery against organisations) per 0020's fix: the inline subquery
-- form breaks from inside a storage.objects policy even for the
-- legitimate representative, because organisations is itself RLS-protected
-- and the security-definer helper is what avoids that interaction.
drop policy if exists org_logos_owner_write on storage.objects;
create policy org_logos_owner_write on storage.objects for all
  using (
    bucket_id = 'org-logos'
    and (is_staff() or is_org_representative(((storage.foldername(name))[1])::uuid))
  )
  with check (
    bucket_id = 'org-logos'
    and (is_staff() or is_org_representative(((storage.foldername(name))[1])::uuid))
  );
