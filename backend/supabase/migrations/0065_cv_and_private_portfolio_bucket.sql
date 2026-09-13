-- AdorWorks — S05-06/S05-07: two real gaps found in the Stage 5 audit.
--
-- 1. No dedicated CV feature existed — talent could only upload a PDF as
--    a generic portfolio item, with no replace-in-place semantics (a
--    new upload was just another list entry, not an overwrite).
-- 2. talent-portfolio (0018) is a PUBLIC bucket — every file a talent
--    uploads is fetchable by direct URL regardless of whether their
--    profile has ever been published or verified. Predates this
--    migration; closing it now alongside the CV work rather than
--    leaving it open.
--
-- Fix for both: a real cv_path slot on talent_profiles (single file,
-- replace like avatar_path already does), and both buckets made
-- private with signed URLs generated server-side — the same pattern
-- talent-videos (0055) already established, and for the same reason:
-- simpler than teaching storage.objects RLS to reach into
-- talent_profiles' own public_visible flag through a security-definer
-- helper, and avoids ever persisting a permanent public URL.
--
-- Write policies are unaffected by the public/private flag (they were
-- already RLS-scoped to owner/staff); only reads change — a public
-- bucket serves anyone via the CDN URL with no RLS involved, a private
-- one requires either an authenticated request that passes RLS (the
-- owner viewing their own files) or a signed URL (everyone else,
-- generated server-side after checking public_visible in application
-- code, same as the video path).

alter table talent_profiles add column if not exists cv_path text;

update storage.buckets set public = false where id = 'talent-portfolio';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('talent-cv', 'talent-cv', false, 8388608, array['application/pdf'])
on conflict (id) do nothing;

drop policy if exists talent_cv_owner_all on storage.objects;
create policy talent_cv_owner_all on storage.objects for all
  using (
    bucket_id = 'talent-cv'
    and ((storage.foldername(name))[1] = auth.uid()::text or is_staff())
  )
  with check (
    bucket_id = 'talent-cv'
    and ((storage.foldername(name))[1] = auth.uid()::text or is_staff())
  );

-- Extends public_talent_profiles with cv_path — same "append only,
-- never reorder/rename an existing column" rule 0034's own comment
-- established (CREATE OR REPLACE VIEW binds columns positionally;
-- violating this errors with 42P16, not a silent reorder). Confirmed
-- live on the first attempt at this migration: 0034 wasn't actually
-- the view's last definition — 0046 redefined it again, appending
-- created_at, which 0034's own column list (reproduced blind from that
-- file alone) didn't include. Reproducing 0046's real, current column
-- list here instead, with cv_path appended after created_at, its true
-- last column. Only the storage PATH is exposed here, never file
-- contents — a real CV download still requires a signed URL generated
-- server-side after confirming this row is genuinely visible to the
-- requester (see platform/src/app/passport/[id]/page.tsx).
create or replace view public_talent_profiles as
select
  id,
  headline,
  category,
  skills,
  languages,
  location,
  work_mode,
  availability,
  years_experience,
  portfolio_url,
  verification_tier,
  display_name,
  bio,
  linkedin_url,
  github_url,
  website_url,
  avatar_path,
  created_at,
  cv_path
from talent_profiles
where public_visible = true;

-- Rollback: alter table talent_profiles drop column cv_path;
--   update storage.buckets set public = true where id = 'talent-portfolio';
--   drop policy if exists talent_cv_owner_all on storage.objects;
--   delete from storage.buckets where id = 'talent-cv';
--   (only safe once every object inside talent-cv has been moved or
--   deleted — Supabase won't let you delete a non-empty bucket.)
--   recreate public_talent_profiles with the 0034 column list (drop
--   the trailing cv_path).
