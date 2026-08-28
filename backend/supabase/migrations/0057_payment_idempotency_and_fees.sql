-- AdorWorks — Stage 7: payment idempotency and a real fee/net breakdown.
--
-- 1. Nothing today stops two concurrent payMilestone() calls (a double
--    click, a retried request after a slow response) from both passing
--    the "milestone.status = 'approved'" check before either has updated
--    it, creating two payment_intentions and charging twice. A partial
--    unique index — only one 'processing' intention per milestone at a
--    time — makes the second concurrent attempt's insert fail outright
--    instead of silently double-charging, without needing a new
--    milestone_status value.
--
-- 2. payment_events has only ever recorded the gross amount — nothing
--    anywhere calculates or discloses a platform fee. Approved decision
--    for this pass: 0% fee, but the real infrastructure (computed and
--    persisted at charge time, so it stays accurate even if the rate
--    changes later) rather than leaving it unbuilt until a rate exists.
--
-- Run this AFTER 0056_portfolio_ordering_and_video_reports.sql.

create unique index if not exists payment_intentions_one_processing_per_milestone
  on payment_intentions(milestone_id)
  where status = 'processing';

alter table payment_events add column if not exists fee_percent numeric not null default 0;
alter table payment_events add column if not exists fee_amount numeric not null default 0;
alter table payment_events add column if not exists net_amount numeric;

-- Backfill: every existing payment_events row predates fee calculation,
-- so its net_amount is its own gross amount (0% fee throughout).
update payment_events set net_amount = amount where net_amount is null;

alter table payment_events alter column net_amount set not null;

-- Rollback: drop index payment_intentions_one_processing_per_milestone;
-- drop columns fee_percent, fee_amount, net_amount from payment_events.
