-- AdorWorks — portfolio items went link-only (no more file upload, per
-- the earlier "use links only" change), which left the public Passport
-- page's portfolio section showing plain text/link rows for every new
-- item instead of the visual grid that used to work for file-based
-- ones. This adds an optional preview-image link so a talent can paste
-- a screenshot/thumbnail URL and get the same visual card, without
-- reintroducing file storage.
--
-- Run this AFTER 0105_intro_video_youtube_link.sql.

alter table talent_portfolio_items
  add column image_url text;
