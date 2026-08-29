-- AdorWorks — fix infinite recursion in opportunities_select.
--
-- 0054's opportunities_select added two inline exists() clauses querying
-- applications and invitations directly. Both of those tables' own SELECT
-- policies (applications_select in 0046, invitations_select in 0050)
-- query opportunities right back via their own inline exists() clauses —
-- so evaluating opportunities_select can trigger applications_select /
-- invitations_select, which triggers opportunities_select again, and
-- Postgres detects the cycle: "infinite recursion detected in policy for
-- relation opportunities" (42P17). Confirmed live: this broke every read
-- of opportunities, including the plain anonymous status=open/
-- visibility=public query the public /opportunities browse page uses —
-- not just the staff dashboard's count queries that surfaced it.
--
-- This is the exact same class of bug 0017 already fixed once for
-- conversation_members, and the fix follows the same established pattern
-- used throughout this schema (is_org_member, is_org_representative,
-- is_staff): wrap the cross-table check in a security definer function.
-- Such a function runs as its owner, which bypasses the callee table's
-- RLS entirely for that internal lookup, instead of re-invoking its
-- user-facing SELECT policy — breaking the cycle at this side only is
-- sufficient; applications_select/invitations_select's own inline
-- exists(select from opportunities...) clauses don't need to change,
-- since the opportunities_select evaluation they trigger no longer
-- loops back into applications/invitations RLS.
--
-- Run this AFTER 0059_conversation_uniqueness.sql.

create or replace function has_applied_to_opportunity(opp_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from applications where opportunity_id = opp_id and talent_id = auth.uid()
  );
$$;

create or replace function has_invitation_for_opportunity(opp_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from invitations where opportunity_id = opp_id and talent_id = auth.uid()
  );
$$;

drop policy if exists opportunities_select on opportunities;
create policy opportunities_select on opportunities for select
  using (
    is_org_member(organisation_id)
    or is_staff()
    or (status = 'open' and visibility = 'public')
    or has_applied_to_opportunity(opportunities.id)
    or has_invitation_for_opportunity(opportunities.id)
  );

-- Rollback: recreate opportunities_select with the two exists() clauses
-- inlined again (0054's version) and drop the two functions above —
-- reintroduces the recursion bug, so only do this if replacing it with
-- a different fix.
