-- AdorWorks — S11-07/S11-08: notification preferences and unsubscribe
-- handling. Neither existed at all: no column, no UI, no way for a user
-- to stop AdorWorks emailing them about activity short of asking staff
-- to do it by hand.
--
-- Scoped deliberately narrow: this app has no marketing/newsletter
-- email at all (grep of every sendEmailSafely call site confirms every
-- email sent is a transactional activity notice — offer/application/
-- milestone/dispute/opportunity updates). There's no separate
-- "essential vs marketing" category to design here, only "email me
-- about activity, yes or no" — a single boolean is the right shape for
-- what this product actually sends today, not a placeholder for a
-- preference-center that doesn't have anything to configure yet.
-- In-app notifications (the notifications table) are unaffected by this
-- flag on purpose — that's the durable record of what happened on your
-- own account and isn't something email opt-out should hide from you.
--
-- Run this AFTER 0085_notification_dedup.sql.

alter table profiles add column if not exists email_notifications_enabled boolean not null default true;

-- Rollback: alter table profiles drop column if exists email_notifications_enabled;
-- (sendEmailSafely's own check in lib/email.ts would need reverting too if this is rolled back.)
