-- Contract cancellation — contracts.status has always had a 'cancelled'
-- value (0006), but nothing in the app ever set it. Adds the audit-trail
-- columns the same way disputes/opportunities already record who acted
-- and why (rejection_reason, resolved_by/resolved_at, etc.) — "every
-- stage change records who changed it and when."
--
-- No RLS change needed: contracts_update (0007) is already staff-only by
-- design (see its policy comment), so setting these columns goes through
-- a Server Action using the admin client, same as completing or
-- disputing a contract already does.

alter table contracts add column if not exists cancelled_at timestamptz;
alter table contracts add column if not exists cancelled_by uuid references profiles(id);
alter table contracts add column if not exists cancellation_reason text;
