-- AdorWorks — Stage 6: portfolio ordering, and reporting granularity for
-- the introduction video and portfolio items specifically.
--
-- talent_portfolio_items.sort_order has existed since 0018 but nothing
-- ever set it to anything but its default 0 — no update policy even
-- existed, so a talent couldn't reorder their own gallery even if the
-- app had a button for it. Adds the missing update policy (title/
-- description/external_url/file_path stay owner-editable too, since
-- there was never a reason to allow reordering but not fixing a typo).
--
-- reports.target_type (0047) only had whole-profile granularity for
-- talent content — a report couldn't identify which portfolio item or
-- that it was about the introduction video specifically.
--
-- Run this AFTER 0055_talent_introduction_video.sql.

drop policy if exists talent_portfolio_items_update on talent_portfolio_items;
create policy talent_portfolio_items_update on talent_portfolio_items for update
  using (talent_id = auth.uid())
  with check (talent_id = auth.uid());

alter table reports drop constraint if exists reports_target_type_check;
alter table reports add constraint reports_target_type_check
  check (target_type in ('opportunity', 'talent_service', 'talent_profile', 'organisation', 'talent_video', 'portfolio_item'));

-- Rollback: drop policy talent_portfolio_items_update; recreate
-- reports_target_type_check without 'talent_video'/'portfolio_item'
-- (safe only if no report rows use those values yet).
