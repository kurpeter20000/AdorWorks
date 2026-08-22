-- AdorWorks — fixes contract messaging being unreadable by real users.
--
-- Found by walkthrough-testing the platform app's messaging feature (the
-- original Phase 1 walkthrough never exercised it). Sending a message
-- worked (it goes through the admin client), but no signed-in user could
-- ever read one back: every read of conversations/messages failed with
-- "infinite recursion detected in policy for relation
-- conversation_members", so src/app/contracts/[id]/page.tsx (which
-- doesn't check the query's error, just destructures data) silently
-- rendered "No messages yet." forever.
--
-- Root cause: 0007's conversation_members_select policy queries
-- conversation_members from inside its own USING clause —
--   exists (select 1 from conversation_members me where ...)
-- — so evaluating visibility for a row requires re-evaluating the same
-- policy for the subquery's rows, forever. messages_select and
-- conversations_select both depend on conversation_members membership
-- checks, so the recursion took every messaging read down with it.
--
-- messages_select had a second, independent bug of the same shape as
-- 0015's: `cm.conversation_id = conversation_id` inside a subquery
-- FROM conversation_members resolves the unqualified `conversation_id`
-- to conversation_members' own column (the innermost scope that has a
-- matching name), not messages.conversation_id — making the check
-- "is the caller a member of ANY conversation" instead of "of THIS
-- one". Same "unqualified column silently binds to the wrong table"
-- footgun as before, just overly permissive instead of overly strict
-- this time.
--
-- Fix: a security-definer helper (same pattern as is_org_member,
-- is_contract_participant) that queries conversation_members directly.
-- Security-definer functions here run as the migration owner, which
-- bypasses RLS on the tables *they* query — that's what actually breaks
-- the cycle, not just correct column-qualification. All three
-- conversation_members-dependent policies now go through it.

create or replace function is_conversation_member(conv_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from conversation_members
    where conversation_id = conv_id and user_id = auth.uid()
  );
$$;

drop policy if exists conversations_select on conversations;
create policy conversations_select on conversations for select
  using (is_staff() or is_conversation_member(id));

drop policy if exists conversation_members_select on conversation_members;
create policy conversation_members_select on conversation_members for select
  using (user_id = auth.uid() or is_staff() or is_conversation_member(conversation_id));

drop policy if exists messages_select on messages;
create policy messages_select on messages for select
  using (is_staff() or is_conversation_member(conversation_id));

drop policy if exists messages_insert on messages;
create policy messages_insert on messages for insert
  with check (sender_id = auth.uid() and is_conversation_member(conversation_id));
