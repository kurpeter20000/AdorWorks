-- AdorWorks — Stage 7 gap-check fix: conversations had no unique
-- constraint on contract_id/application_id. Both postSystemMessage
-- (contracts.ts) and sendApplicationMessage (messages.ts) use a
-- check-then-insert pattern ("select existing conversation; if none,
-- insert one") with no protection against two simultaneous first
-- messages both passing the check and each inserting their own
-- conversation row for the same contract/application.
--
-- This isn't just a one-time fork: once two rows exist for the same
-- scope, every future .maybeSingle() lookup errors on "multiple rows"
-- and returns null data, which the app code reads as "no conversation
-- yet" — creating yet another new one-message conversation on every
-- subsequent send, silently, forever. A unique index turns the race
-- into a clean 23505 the app code now catches and recovers from by
-- reading back the winning row instead.
--
-- Defensive dedup first, in case a fork already happened before this
-- migration: merge every duplicate's messages/members onto the oldest
-- row, then delete the extras, so the unique index below can actually
-- be created.

do $$
declare
  dupe record;
  keep_id uuid;
begin
  for dupe in
    select contract_id, array_agg(id order by created_at) as ids
    from conversations
    where contract_id is not null
    group by contract_id
    having count(*) > 1
  loop
    keep_id := dupe.ids[1];
    update messages set conversation_id = keep_id where conversation_id = any(dupe.ids[2:array_length(dupe.ids, 1)]);
    insert into conversation_members (conversation_id, user_id)
      select keep_id, user_id from conversation_members where conversation_id = any(dupe.ids[2:array_length(dupe.ids, 1)])
      on conflict do nothing;
    delete from conversation_members where conversation_id = any(dupe.ids[2:array_length(dupe.ids, 1)]);
    delete from conversations where id = any(dupe.ids[2:array_length(dupe.ids, 1)]);
  end loop;

  for dupe in
    select application_id, array_agg(id order by created_at) as ids
    from conversations
    where application_id is not null
    group by application_id
    having count(*) > 1
  loop
    keep_id := dupe.ids[1];
    update messages set conversation_id = keep_id where conversation_id = any(dupe.ids[2:array_length(dupe.ids, 1)]);
    insert into conversation_members (conversation_id, user_id)
      select keep_id, user_id from conversation_members where conversation_id = any(dupe.ids[2:array_length(dupe.ids, 1)])
      on conflict do nothing;
    delete from conversation_members where conversation_id = any(dupe.ids[2:array_length(dupe.ids, 1)]);
    delete from conversations where id = any(dupe.ids[2:array_length(dupe.ids, 1)]);
  end loop;
end $$;

create unique index if not exists conversations_one_per_contract on conversations(contract_id) where contract_id is not null;
create unique index if not exists conversations_one_per_application on conversations(application_id) where application_id is not null;

-- Rollback: drop index conversations_one_per_contract;
-- drop index conversations_one_per_application.
