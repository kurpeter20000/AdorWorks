-- AdorWorks — switch the talent introduction video from a self-hosted
-- file upload to a YouTube link: storing/serving video files through
-- Supabase Storage carries real, ongoing cost at any scale, and talent
-- already has a free, reliable host for this in YouTube (unlisted
-- uploads work fine — nothing requires the video be publicly listed on
-- YouTube itself, only reachable by URL). The platform just stores the
-- link and embeds it; status/review/transcript all stay exactly as
-- they were, since who approves what didn't change, only where the
-- bytes live.
--
-- Confirmed empty (test and production, both checked immediately before
-- writing this) before dropping video_path/thumbnail_path/
-- duration_seconds — if that's no longer true by the time this runs,
-- STOP and re-check before applying; this drops those columns'
-- contents irrecoverably.
--
-- Run this AFTER 0104_fix_rate_limit_action_check_regression.sql.

alter table talent_introduction_videos
  add column youtube_url text;

alter table talent_introduction_videos
  drop column video_path,
  drop column thumbnail_path,
  drop column duration_seconds;

alter table talent_introduction_videos
  alter column youtube_url set not null,
  add constraint talent_introduction_videos_youtube_url_check
    check (youtube_url ~ '^https://(www\.)?(youtube\.com/(watch\?v=|embed/|shorts/)|youtu\.be/)[A-Za-z0-9_-]{6,}');

-- No more files to store — drop the owner-folder policy (storage.objects
-- RLS). The talent-videos bucket row itself is left in place: Supabase
-- blocks a direct `delete from storage.buckets` (storage.protect_delete
-- trigger — "Use the Storage API instead"), and since nothing will ever
-- write an object into it again, an empty, policy-less bucket costs
-- nothing and isn't worth a separate Storage-API cleanup step. Delete it
-- via the Supabase dashboard's Storage UI later if you want it gone.
drop policy if exists talent_videos_owner_all on storage.objects;

-- Rollback (only valid while the table is still empty — this doesn't
-- restore dropped video_path/thumbnail_path/duration_seconds data):
--   alter table talent_introduction_videos drop constraint talent_introduction_videos_youtube_url_check;
--   alter table talent_introduction_videos drop column youtube_url;
--   alter table talent_introduction_videos
--     add column video_path text not null,
--     add column thumbnail_path text,
--     add column duration_seconds numeric;
--   insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
--     values ('talent-videos', 'talent-videos', false, 104857600, array['video/mp4', 'video/webm', 'video/quicktime']);
--   create policy talent_videos_owner_all on storage.objects for all
--     using (bucket_id = 'talent-videos' and ((storage.foldername(name))[1] = auth.uid()::text or is_staff()))
--     with check (bucket_id = 'talent-videos' and ((storage.foldername(name))[1] = auth.uid()::text or is_staff()));
