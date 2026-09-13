-- AdorWorks — S04-05: rate limits / abuse controls on authentication.
-- No rate-limiting library exists anywhere in the repo; login, signup
-- and password-reset-request currently accept unlimited attempts.
--
-- Table-backed (not in-memory) deliberately: Vercel can run multiple
-- serverless instances, so an in-memory counter wouldn't actually limit
-- anything across them. Each row is one real attempt, so this table
-- also doubles as the attempt log the tracker item asks for
-- ("repeated... attempts are limited and logged").
--
-- Written to and read from only by the admin/service-role client (see
-- platform/src/lib/domain/rateLimit.ts) — no RLS policy grants regular
-- users any access, same pattern as audit_events (0035).

create table if not exists auth_rate_limit_attempts (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('login', 'signup', 'password_reset_request')),
  identifier text not null,
  created_at timestamptz not null default now()
);

create index if not exists auth_rate_limit_attempts_lookup_idx
  on auth_rate_limit_attempts (action, identifier, created_at);

alter table auth_rate_limit_attempts enable row level security;
-- No policies created — service-role/admin client bypasses RLS
-- entirely (same as audit_events), and no regular user should ever be
-- able to read or write this table directly.

-- Rollback: drop table auth_rate_limit_attempts;
