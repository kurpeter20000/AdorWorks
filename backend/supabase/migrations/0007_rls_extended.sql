-- AdorWorks — RLS for everything added in 0005 and 0006.
-- Run this AFTER 0006_contracts_and_vertical_slice.sql.

-- ---------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------

create or replace function is_org_member(org_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from organisation_members
    where organisation_id = org_id and user_id = auth.uid()
  );
$$;

create or replace function is_org_admin(org_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from organisation_members
    where organisation_id = org_id and user_id = auth.uid() and role = 'admin'
  ) or is_org_representative(org_id); -- 0001's legacy single-representative model, kept working
$$;

create or replace function is_contract_participant(c_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from contracts c
    where c.id = c_id
      and (c.talent_id = auth.uid() or is_org_member(c.organisation_id))
  );
$$;

create or replace function is_assigned_active_agent(session_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from assistance_sessions s
    where s.id = session_id and s.agent_id = auth.uid() and s.status = 'active'
  );
$$;

-- ---------------------------------------------------------------------
-- organisation_members
-- ---------------------------------------------------------------------

alter table organisation_members enable row level security;

drop policy if exists organisation_members_select on organisation_members;
create policy organisation_members_select on organisation_members for select
  using (user_id = auth.uid() or is_org_member(organisation_id) or is_staff());

drop policy if exists organisation_members_insert on organisation_members;
create policy organisation_members_insert on organisation_members for insert
  with check (is_org_admin(organisation_id) or is_staff());

drop policy if exists organisation_members_update on organisation_members;
create policy organisation_members_update on organisation_members for update
  using (is_org_admin(organisation_id) or is_staff())
  with check (is_org_admin(organisation_id) or is_staff());

drop policy if exists organisation_members_delete on organisation_members;
create policy organisation_members_delete on organisation_members for delete
  using (is_org_admin(organisation_id) or is_staff());

-- ---------------------------------------------------------------------
-- partner_hubs / onboarding_agents — staff-managed. A partner hub's own
-- admin visibility is intentionally deferred (no partner_hub_admin ->
-- partner_hub linkage table yet) — staff only for Phase 1.
-- ---------------------------------------------------------------------

alter table partner_hubs enable row level security;
alter table onboarding_agents enable row level security;

drop policy if exists partner_hubs_select on partner_hubs;
create policy partner_hubs_select on partner_hubs for select using (is_staff());
drop policy if exists partner_hubs_write on partner_hubs;
create policy partner_hubs_write on partner_hubs for all using (is_admin()) with check (is_admin());

drop policy if exists onboarding_agents_select on onboarding_agents;
create policy onboarding_agents_select on onboarding_agents for select
  using (id = auth.uid() or is_staff());
drop policy if exists onboarding_agents_write on onboarding_agents;
create policy onboarding_agents_write on onboarding_agents for all
  using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------
-- assistance_requests
-- ---------------------------------------------------------------------

alter table assistance_requests enable row level security;

drop policy if exists assistance_requests_select on assistance_requests;
create policy assistance_requests_select on assistance_requests for select
  using (requested_by = auth.uid() or is_staff());

drop policy if exists assistance_requests_insert on assistance_requests;
create policy assistance_requests_insert on assistance_requests for insert
  with check (true); -- may come from someone with no account yet (requested_by null)

drop policy if exists assistance_requests_update on assistance_requests;
create policy assistance_requests_update on assistance_requests for update
  using (is_staff())
  with check (is_staff());

-- ---------------------------------------------------------------------
-- assistance_sessions — the enforcement point. The user themself and
-- the assigned agent (only while active) can see it; only staff/the
-- consenting user create or change it, per the spec's explicit rule
-- that an agent cannot grant or extend their own access.
-- ---------------------------------------------------------------------

alter table assistance_sessions enable row level security;

drop policy if exists assistance_sessions_select on assistance_sessions;
create policy assistance_sessions_select on assistance_sessions for select
  using (user_id = auth.uid() or agent_id = auth.uid() or is_staff());

drop policy if exists assistance_sessions_insert on assistance_sessions;
create policy assistance_sessions_insert on assistance_sessions for insert
  with check (is_staff());

drop policy if exists assistance_sessions_update on assistance_sessions;
create policy assistance_sessions_update on assistance_sessions for update
  using (
    -- the assisted user may revoke their own session at any time
    user_id = auth.uid() or is_staff()
  )
  with check (
    user_id = auth.uid() or is_staff()
  );

-- ---------------------------------------------------------------------
-- assisted_field_changes — immutable; only the active assigned agent
-- (during their own session) or staff may insert, matching the field-
-- level authorization rule. No update/delete policy: append-only log.
-- ---------------------------------------------------------------------

alter table assisted_field_changes enable row level security;

drop policy if exists assisted_field_changes_select on assisted_field_changes;
create policy assisted_field_changes_select on assisted_field_changes for select
  using (
    is_staff()
    or exists (
      select 1 from assistance_sessions s
      where s.id = session_id and (s.user_id = auth.uid() or s.agent_id = auth.uid())
    )
  );

drop policy if exists assisted_field_changes_insert on assisted_field_changes;
create policy assisted_field_changes_insert on assisted_field_changes for insert
  with check (is_assigned_active_agent(session_id) or is_staff());

-- ---------------------------------------------------------------------
-- honorifics — public reference data
-- ---------------------------------------------------------------------

alter table honorifics enable row level security;
drop policy if exists honorifics_select_all on honorifics;
create policy honorifics_select_all on honorifics for select using (true);

-- ---------------------------------------------------------------------
-- screening_questions / screening_answers / saved_opportunities
-- ---------------------------------------------------------------------

alter table screening_questions enable row level security;
drop policy if exists screening_questions_select on screening_questions;
create policy screening_questions_select on screening_questions for select
  using (
    is_staff()
    or exists (
      select 1 from opportunities o
      where o.id = opportunity_id and (o.status = 'open' or is_org_member(o.organisation_id))
    )
  );
drop policy if exists screening_questions_write on screening_questions;
create policy screening_questions_write on screening_questions for all
  using (
    is_staff() or exists (
      select 1 from opportunities o where o.id = opportunity_id and is_org_member(o.organisation_id)
    )
  )
  with check (
    is_staff() or exists (
      select 1 from opportunities o where o.id = opportunity_id and is_org_member(o.organisation_id)
    )
  );

alter table screening_answers enable row level security;
drop policy if exists screening_answers_select on screening_answers;
create policy screening_answers_select on screening_answers for select
  using (
    is_staff()
    or exists (
      select 1 from applications a where a.id = application_id and (
        a.talent_id = auth.uid()
        or exists (select 1 from opportunities o where o.id = a.opportunity_id and is_org_member(o.organisation_id))
      )
    )
  );
drop policy if exists screening_answers_insert on screening_answers;
create policy screening_answers_insert on screening_answers for insert
  with check (
    exists (select 1 from applications a where a.id = application_id and a.talent_id = auth.uid())
  );

alter table saved_opportunities enable row level security;
drop policy if exists saved_opportunities_all on saved_opportunities;
create policy saved_opportunities_all on saved_opportunities for all
  using (talent_id = auth.uid())
  with check (talent_id = auth.uid());

-- ---------------------------------------------------------------------
-- offers
-- ---------------------------------------------------------------------

alter table offers enable row level security;

drop policy if exists offers_select on offers;
create policy offers_select on offers for select
  using (talent_id = auth.uid() or is_org_member(organisation_id) or is_staff());

drop policy if exists offers_insert on offers;
create policy offers_insert on offers for insert
  with check (is_org_member(organisation_id) or is_staff());

-- UPDATE is intentionally narrow: an org can only freely edit its own
-- offer while it's still an unsent draft (status='draft', checked
-- against the pre-update row by USING). Sending an offer, and a talent
-- accepting/declining one, both change compensation-adjacent state and
-- go through a Server Action using the service_role client instead —
-- service_role bypasses RLS by design, gated there by an explicit
-- authorization + business-rule check in TypeScript (mirroring
-- backend/api's pattern), rather than by a wide-open RLS grant that a
-- direct REST call could exploit (e.g. a talent inflating their own
-- offer's compensation_amount before "accepting" it).
drop policy if exists offers_update on offers;
create policy offers_update on offers for update
  using ((is_org_member(organisation_id) and status = 'draft') or is_staff())
  with check ((is_org_member(organisation_id) and status = 'draft') or is_staff());

-- ---------------------------------------------------------------------
-- contracts / milestones / deliverables / timesheets
-- ---------------------------------------------------------------------

alter table contracts enable row level security;
drop policy if exists contracts_select on contracts;
create policy contracts_select on contracts for select
  using (talent_id = auth.uid() or is_org_member(organisation_id) or is_staff());
drop policy if exists contracts_insert on contracts;
create policy contracts_insert on contracts for insert
  with check (
    is_staff() or is_org_member(organisation_id)
    or exists (select 1 from offers o where o.id = offer_id and o.talent_id = auth.uid() and o.status = 'accepted')
  );
-- No direct-client UPDATE path for either participant: completing,
-- cancelling or disputing a contract has side effects (work_history
-- creation on completion, etc.) that belong in a Server Action using
-- service_role, not a bare column PATCH a participant could otherwise
-- send straight to the REST API.
drop policy if exists contracts_update on contracts;
create policy contracts_update on contracts for update
  using (is_staff())
  with check (is_staff());

-- Participants can only READ milestones directly. Every status change
-- (submitted -> approved -> paid) is a Server Action, not a client
-- PATCH — otherwise a talent could mark their own milestone 'paid'
-- with nothing behind it, or a client could quietly shrink 'amount'
-- after the fact.
alter table milestones enable row level security;
drop policy if exists milestones_select on milestones;
create policy milestones_select on milestones for select
  using (is_contract_participant(contract_id) or is_staff());
drop policy if exists milestones_write on milestones;
create policy milestones_write on milestones for all
  using (is_staff())
  with check (is_staff());

alter table deliverables enable row level security;
drop policy if exists deliverables_select on deliverables;
create policy deliverables_select on deliverables for select
  using (
    is_staff() or exists (
      select 1 from milestones m where m.id = milestone_id and is_contract_participant(m.contract_id)
    )
  );
drop policy if exists deliverables_insert on deliverables;
create policy deliverables_insert on deliverables for insert
  with check (
    submitted_by = auth.uid() and exists (
      select 1 from milestones m where m.id = milestone_id and is_contract_participant(m.contract_id)
    )
  );
-- Approving/requesting revision on a deliverable is the client's call,
-- but it's still a Server Action (it also has to move the milestone
-- forward, and possibly complete the contract) — not a direct PATCH,
-- so a talent can't approve their own submission.
drop policy if exists deliverables_update on deliverables;
create policy deliverables_update on deliverables for update
  using (is_staff())
  with check (is_staff());

alter table timesheets enable row level security;
drop policy if exists timesheets_all on timesheets;
create policy timesheets_all on timesheets for all
  using (is_contract_participant(contract_id) or is_staff())
  with check (is_contract_participant(contract_id) or is_staff());

-- ---------------------------------------------------------------------
-- work_history — publicly readable (it's the Passport record), staff-
-- or-system written only (created on contract completion, not by users
-- directly).
-- ---------------------------------------------------------------------

alter table work_history enable row level security;
drop policy if exists work_history_select_all on work_history;
create policy work_history_select_all on work_history for select using (true);
drop policy if exists work_history_insert_staff on work_history;
create policy work_history_insert_staff on work_history for insert with check (is_staff());

-- ---------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------

alter table conversations enable row level security;
drop policy if exists conversations_select on conversations;
create policy conversations_select on conversations for select
  using (
    is_staff() or exists (
      select 1 from conversation_members cm where cm.conversation_id = id and cm.user_id = auth.uid()
    )
  );
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
  );

alter table conversation_members enable row level security;
drop policy if exists conversation_members_select on conversation_members;
create policy conversation_members_select on conversation_members for select
  using (
    user_id = auth.uid() or is_staff()
    or exists (select 1 from conversation_members me where me.conversation_id = conversation_id and me.user_id = auth.uid())
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
      )
    )
  );

alter table messages enable row level security;
drop policy if exists messages_select on messages;
create policy messages_select on messages for select
  using (
    is_staff() or exists (
      select 1 from conversation_members cm where cm.conversation_id = conversation_id and cm.user_id = auth.uid()
    )
  );
drop policy if exists messages_insert on messages;
create policy messages_insert on messages for insert
  with check (
    sender_id = auth.uid() and exists (
      select 1 from conversation_members cm where cm.conversation_id = conversation_id and cm.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- payment_events — read-only to contract participants; writes only via
-- the service layer (service_role), matching "no code path sets
-- is_simulated false" — regular users, even org admins, never insert
-- these directly, so the mock boundary can't be bypassed client-side.
-- ---------------------------------------------------------------------

alter table payment_events enable row level security;
drop policy if exists payment_events_select on payment_events;
create policy payment_events_select on payment_events for select
  using (is_contract_participant(contract_id) or is_staff());
