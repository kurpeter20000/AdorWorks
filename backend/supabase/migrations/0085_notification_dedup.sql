-- AdorWorks — S11-05: duplicate-notification prevention. notifyUser()
-- (platform/src/lib/domain/notifications.ts) was a plain insert with no
-- idempotency key and no unique constraint — a double form submit, a
-- React re-render race, or a retried server action could write the same
-- notification twice with nothing to stop it.
--
-- dedupe_key defaults to a fresh random value per row (never colliding on
-- its own) so ordinary, non-deduped notifyUser() calls are completely
-- unaffected. A caller that wants dedup passes an explicit dedupe_key
-- (e.g. the id of the row whose one-way state transition triggered the
-- notification) and the unique index below then blocks a second identical
-- (user_id, type, dedupe_key) row outright, at the database layer, not
-- just in application code.
--
-- Deliberately NOT applied to every notifyUser() call site: a handful of
-- notification types describe events that can legitimately recur for the
-- same entity (a contract can have more than one dispute over its
-- lifetime; an opportunity can be rejected, edited, and rejected again;
-- every chat message is a genuinely new event) — permanently deduping
-- those by entity id would silently swallow a real, later notification
-- instead of a duplicate one. Those call sites are left undeduped on
-- purpose; see the comments at each in the follow-up commit.
--
-- Run this AFTER 0084_safeguarding_reports.sql.

alter table notifications add column if not exists dedupe_key text not null default gen_random_uuid()::text;

create unique index if not exists notifications_dedupe_uidx on notifications(user_id, type, dedupe_key);

-- Rollback: drop index if exists notifications_dedupe_uidx; alter table notifications drop column if exists dedupe_key;
