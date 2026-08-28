-- AdorWorks — Stage 6: talent introduction video.
--
-- A short, personal bio video — "who I am, what I do" — so an employer
-- can see and hear the person before trusting them with real work. Not a
-- portfolio reel (talent_portfolio_items already covers work samples) and
-- not a verification substitute: optional, never a ranking input, and
-- gated by real staff moderation before it's ever shown publicly, unlike
-- the existing (unmoderated) portfolio gallery — video is a materially
-- higher trust surface (a real person's face and voice) than a static
-- image or PDF, which is why this gets a review step and portfolio
-- items still don't.
--
-- One video per talent (replacing an old one resets it to 'pending' —
-- see the update policy) rather than a gallery: this is meant to be THE
-- single introduction, not a collection.
--
-- Private bucket + signed URLs generated server-side by the admin client
-- (see platform/src/app/passport/[id]/page.tsx), not client-side via the
-- viewer's own session — simpler than teaching storage.objects RLS to
-- reach into two other RLS-protected tables (talent_introduction_videos,
-- talent_profiles) through a security-definer helper, and avoids ever
-- persisting a permanent public URL for private video content.
--
-- Run this AFTER 0054_application_truthfulness_correction.sql.

create table if not exists talent_introduction_videos (
  talent_id uuid primary key references talent_profiles(id) on delete cascade,
  video_path text not null,
  thumbnail_path text,
  transcript text,
  duration_seconds numeric,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table talent_introduction_videos enable row level security;

drop policy if exists talent_introduction_videos_select on talent_introduction_videos;
create policy talent_introduction_videos_select on talent_introduction_videos for select
  using (
    talent_id = auth.uid()
    or is_staff()
    or (
      status = 'approved'
      and exists (select 1 from talent_profiles tp where tp.id = talent_id and tp.public_visible = true)
    )
  );

drop policy if exists talent_introduction_videos_insert on talent_introduction_videos;
create policy talent_introduction_videos_insert on talent_introduction_videos for insert
  with check (talent_id = auth.uid() and status = 'pending');

-- Any edit by the talent — including just fixing a transcript typo —
-- resets to 'pending' (the with check below forces it). Deliberately
-- simple rather than distinguishing "content changed" from "metadata
-- changed": trust-relevant media gets re-reviewed on any touch.
drop policy if exists talent_introduction_videos_update_owner on talent_introduction_videos;
create policy talent_introduction_videos_update_owner on talent_introduction_videos for update
  using (talent_id = auth.uid())
  with check (talent_id = auth.uid() and status = 'pending');

drop policy if exists talent_introduction_videos_delete_owner on talent_introduction_videos;
create policy talent_introduction_videos_delete_owner on talent_introduction_videos for delete
  using (talent_id = auth.uid());

drop policy if exists talent_introduction_videos_staff_all on talent_introduction_videos;
create policy talent_introduction_videos_staff_all on talent_introduction_videos for all
  using (is_staff())
  with check (is_staff());

-- Storage: private (unlike talent-avatars/talent-portfolio), with real
-- server-enforced type/size limits — gap-check-adjacent finding while
-- building this: none of the existing public talent buckets enforce
-- type/size at the storage layer at all, only in client-side JS, so a
-- direct API call bypassing the UI could upload anything. Fixed for
-- those two existing buckets in the same migration below, and built in
-- from the start here.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('talent-videos', 'talent-videos', false, 104857600, array['video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists talent_videos_owner_all on storage.objects;
create policy talent_videos_owner_all on storage.objects for all
  using (
    bucket_id = 'talent-videos'
    and ((storage.foldername(name))[1] = auth.uid()::text or is_staff())
  )
  with check (
    bucket_id = 'talent-videos'
    and ((storage.foldername(name))[1] = auth.uid()::text or is_staff())
  );

-- Correction to the two existing public talent buckets: enforce the same
-- limits their upload components already claim to enforce in JS
-- (platform/src/app/passport/avatar-upload.tsx, portfolio-manager.tsx),
-- server-side too, so the real boundary doesn't depend on the client
-- being honest.
update storage.buckets
set file_size_limit = 4194304, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'talent-avatars';

update storage.buckets
set file_size_limit = 8388608, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
where id = 'talent-portfolio';

-- Rollback: drop table talent_introduction_videos; drop policy
-- talent_videos_owner_all on storage.objects; delete the talent-videos
-- bucket row; reset talent-avatars/talent-portfolio's file_size_limit
-- and allowed_mime_types back to null (unrestricted).
