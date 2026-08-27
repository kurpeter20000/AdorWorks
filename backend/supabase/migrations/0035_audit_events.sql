-- AdorWorks — Stage 1 foundations: a durable, append-only audit log.
-- platform/src/lib/domain/events.ts already fixed the event-name vocabulary
-- ("Stage 1 fixes the vocabulary; later stages add storage and emit only
-- events whose underlying business action succeeded") — this migration is
-- that storage. Same no-insert-policy-for-regular-users pattern already
-- used by verification_events/engagement_events/assisted_field_changes:
-- only the service_role key (the platform app's admin client, or
-- backend/api's supabaseAdmin) can write, since only a trusted
-- server-side context can guarantee who actually performed an action.
--
-- This is intentionally a plain table, not a trigger-driven one — actions
-- log their own outcome only after the real write succeeds, so a rejected
-- write never produces a misleading audit row.
--
-- Run this AFTER 0034_public_talent_profile_safe_projection.sql.

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  occurred_at timestamptz not null default now(),
  actor_id uuid references profiles(id) on delete set null,
  subject_id uuid references profiles(id) on delete set null,
  entity_type text not null,
  entity_id text not null,
  reason text,
  source text not null check (source in ('platform', 'staff_api', 'database', 'public_site')),
  before jsonb,
  after jsonb,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists audit_events_entity_idx on audit_events(entity_type, entity_id);
create index if not exists audit_events_actor_idx on audit_events(actor_id);
create index if not exists audit_events_occurred_idx on audit_events(occurred_at desc);

alter table audit_events enable row level security;

drop policy if exists audit_events_select_staff on audit_events;
create policy audit_events_select_staff on audit_events for select
  using (is_staff());

-- Rollback: drop table audit_events; (nothing else reads or writes it yet
-- outside the two call sites this stage adds, both of which fail open —
-- an audit-write failure never blocks the underlying action).
