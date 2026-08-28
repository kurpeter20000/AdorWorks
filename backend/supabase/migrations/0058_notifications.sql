-- AdorWorks — Stage 7: in-app notifications. Nothing like this existed
-- before — no bell, no list, no unread state anywhere in the app.
--
-- Written by the service layer only (the admin client, from server
-- actions/routes at the moment something notification-worthy happens),
-- same "regular users never insert these directly" boundary as
-- payment_events/payment_intentions — a notification is a record of
-- something the SYSTEM decided happened, not something a user reports
-- about themselves.
--
-- Run this AFTER 0057_payment_idempotency_and_fees.sql.

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on notifications(user_id, created_at desc);
create index if not exists notifications_user_unread_idx on notifications(user_id) where read_at is null;

alter table notifications enable row level security;

drop policy if exists notifications_select on notifications;
create policy notifications_select on notifications for select
  using (user_id = auth.uid() or is_staff());

-- A recipient may only ever mark their own notification read — nothing
-- else about a notification is user-editable.
drop policy if exists notifications_update_owner on notifications;
create policy notifications_update_owner on notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists notifications_staff_all on notifications;
create policy notifications_staff_all on notifications for all
  using (is_staff())
  with check (is_staff());

-- Rollback (Stage 10: literal, executable, not prose):
--   drop table if exists notifications;
-- Warning: this deletes every notification ever recorded, including
-- unread ones a user has never seen. Not recoverable. If the goal is
-- only to disable the FEATURE (stop writing new ones) rather than erase
-- history, don't run this -- notifyUser() already fails open/silently
-- on any write error, so leaving the table in place and simply not
-- calling notifyUser() from a reverted call site is the safer partial
-- rollback.
