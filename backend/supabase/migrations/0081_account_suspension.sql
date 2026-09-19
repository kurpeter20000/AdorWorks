-- AdorWorks — S10-08: account suspension and reinstatement.
--
-- profiles.status already had an 'active'/'suspended'/'deleted' check
-- constraint (0001) and requireSession() already blocks any suspended/
-- deleted account from reaching a server-rendered page or Server Action
-- (platform/src/lib/dal/session.ts:70) — but nothing anywhere ever set
-- status to 'suspended'. The control genuinely didn't exist (2026-09-19
-- audit finding S10-08: "no endpoint anywhere sets it").
--
-- These columns give the decision an on-the-row audit trail (same
-- convention as verification_checks' decided_by/decided_at) in addition
-- to the append-only audit_events log — an admin looking at one profile
-- doesn't need to cross-reference the audit log just to see why someone
-- is suspended.
--
-- Deliberately does NOT retrofit every RLS policy in this schema to also
-- check profiles.status = 'active' — that's a much larger, higher-risk
-- change (80+ migrations of policies to touch) than this stage's finding
-- calls for, and this project has already been burned once by exactly
-- this kind of broad RLS retrofit drifting silently (0070). The real
-- residual risk this leaves is narrow: a suspended user with a still-
-- valid, unexpired JWT calling the Supabase REST API directly (bypassing
-- the Next.js app) could still write via RLS until that token expires —
-- the suspend endpoint (backend/api/src/routes/people.js) closes that
-- specific gap by also rotating the account's password, the same
-- technique force-reauth already uses, ending their session within the
-- hour rather than leaving it live until they happen to log out.
--
-- Run this AFTER 0080_service_offers_and_contracts.sql.

alter table profiles add column if not exists suspended_reason text;
alter table profiles add column if not exists suspended_at timestamptz;
alter table profiles add column if not exists suspended_by uuid references profiles(id);
alter table profiles add column if not exists reinstated_at timestamptz;
alter table profiles add column if not exists reinstated_by uuid references profiles(id);

-- Rollback: alter table profiles drop column suspended_reason, suspended_at,
-- suspended_by, reinstated_at, reinstated_by.
