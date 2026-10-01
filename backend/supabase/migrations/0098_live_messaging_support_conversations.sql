-- 0098 — Stage 16, step 3: live messaging + "AdorWorks Support" conversations.
--
-- 1. Realtime: adds `messages` to the supabase_realtime publication, so an
--    open conversation streams new rows in instead of needing a page
--    reload — covers both the sender's own just-sent message and the
--    other side's reply. RLS on messages (0007, unchanged by this
--    migration) is what limits each subscriber to conversations they're
--    actually in; Supabase's Realtime respects that same RLS for
--    postgres_changes subscriptions, so enabling it here doesn't widen
--    who can read what.
-- 2. conversations gains a third scope: `support_user_id` — a user's own
--    direct line to AdorWorks staff, alongside the existing contract/
--    application scopes (0006). One per user (unique index), same shape
--    as the existing one-per-contract/one-per-application indexes (0059).
--    Contact-detail blocking and the dispute-to-support handoff are app
--    logic (lib/dal/support.ts, lib/domain/messageFilter.ts) — nothing
--    further to add at the database level for those.
--
-- Rollback:
--   alter publication supabase_realtime drop table messages;
--   drop policy conversation_members_insert on conversation_members;
--   create policy conversation_members_insert on conversation_members for insert
--     with check ( ... pre-0098 definition, see 0007_rls_extended.sql ... );
--   drop policy conversations_insert on conversations;
--   create policy conversations_insert on conversations for insert
--     with check ( ... pre-0098 definition, see 0007_rls_extended.sql ... );
--   drop index if exists conversations_one_per_support_user;
--   alter table conversations drop constraint conversations_scope;
--   alter table conversations add constraint conversations_scope check
--     (contract_id is not null or application_id is not null);
--   alter table conversations drop column support_user_id;

-- Not supported inside PGlite (no logical replication) — stripped before
-- replay by verify-clean-migrations.mjs / check-schema-drift.mjs, same
-- treatment as the pg_cron extension line those scripts already skip.
alter publication supabase_realtime add table messages;

alter table conversations add column if not exists support_user_id uuid references profiles(id);

alter table conversations drop constraint if exists conversations_scope;
alter table conversations add constraint conversations_scope check (
  contract_id is not null or application_id is not null or support_user_id is not null
);

create unique index if not exists conversations_one_per_support_user
  on conversations(support_user_id) where support_user_id is not null;

drop policy if exists conversations_insert on conversations;
create policy conversations_insert on conversations for insert
  with check (
    is_staff()
    or (contract_id is not null and is_contract_participant(contract_id))
    or (application_id is not null and exists (
      select 1 from applications a where a.id = application_id and (
        a.talent_id = auth.uid()
        or exists (select 1 from opportunities o where o.id = a.opportunity_id and is_org_member(o.organisation_id))
      )
    ))
    or (support_user_id is not null and support_user_id = auth.uid())
  );

drop policy if exists conversation_members_insert on conversation_members;
create policy conversation_members_insert on conversation_members for insert
  with check (
    is_staff() or exists (
      select 1 from conversations c where c.id = conversation_id and (
        (c.contract_id is not null and is_contract_participant(c.contract_id))
        or (c.application_id is not null and exists (
          select 1 from applications a where a.id = c.application_id and (
            a.talent_id = auth.uid()
            or exists (select 1 from opportunities o where o.id = a.opportunity_id and is_org_member(o.organisation_id))
          )
        ))
        or (c.support_user_id is not null and c.support_user_id = auth.uid())
      )
    )
  );
