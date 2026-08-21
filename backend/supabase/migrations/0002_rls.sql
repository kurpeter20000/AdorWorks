-- AdorWorks — Row Level Security
--
-- Implements the permission matrix in the AdorWorks Startup & Website
-- Blueprint §7.3 (Visitor / Talent / Employer / Reviewer / Matcher /
-- Finance / Administrator) directly at the database level, so "private
-- identity and contact records are inaccessible to public users and
-- unauthorised roles" (§7.12 MVP acceptance criteria) holds even if the
-- API layer has a bug — RLS is the actual enforcement, the API is a
-- convenience on top of it.
--
-- Run this AFTER 0001_schema.sql.

-- ---------------------------------------------------------------------
-- Helper functions (security definer: they need to read profiles/
-- organisations regardless of the caller's own RLS visibility, but each
-- only ever returns a boolean or the caller's own role — never row data).
-- ---------------------------------------------------------------------

create or replace function current_user_role()
returns user_role
language sql stable security definer set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(current_user_role() in ('reviewer', 'matcher', 'finance', 'admin'), false);
$$;

create or replace function is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(current_user_role() = 'admin', false);
$$;

create or replace function is_finance_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(current_user_role() in ('finance', 'admin'), false);
$$;

create or replace function is_org_representative(org_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from organisations where id = org_id and representative_id = auth.uid()
  );
$$;

create or replace function is_engagement_participant(eng_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from engagements e
    where e.id = eng_id
      and (e.talent_id = auth.uid() or is_org_representative(e.organisation_id))
  );
$$;

-- ---------------------------------------------------------------------
-- Enable RLS everywhere. A table with RLS enabled and NO policies
-- default-denies everyone except the service_role key (used only by the
-- backend API, never the frontend) — that's the correct default for
-- tables like verification_events and engagement_events, which have no
-- direct-write policy below (writes for those go through the API only).
-- ---------------------------------------------------------------------

alter table profiles enable row level security;
alter table talent_profiles enable row level security;
alter table talent_evidence enable row level security;
alter table verification_events enable row level security;
alter table organisations enable row level security;
alter table opportunities enable row level security;
alter table applications enable row level security;
alter table engagements enable row level security;
alter table engagement_events enable row level security;
alter table finance_records enable row level security;
alter table reviews enable row level security;
alter table disputes enable row level security;
alter table intake_submissions enable row level security;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------

drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select
  using (id = auth.uid() or is_staff());

drop policy if exists profiles_insert_self on profiles;
create policy profiles_insert_self on profiles for insert
  with check (id = auth.uid());

drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update
  using (id = auth.uid() or is_staff())
  with check (id = auth.uid() or is_staff());

drop policy if exists profiles_delete_admin on profiles;
create policy profiles_delete_admin on profiles for delete
  using (is_admin());

-- ---------------------------------------------------------------------
-- talent_profiles
-- ---------------------------------------------------------------------

drop policy if exists talent_profiles_select on talent_profiles;
create policy talent_profiles_select on talent_profiles for select
  using (id = auth.uid() or is_staff() or public_visible = true);

drop policy if exists talent_profiles_insert_self on talent_profiles;
create policy talent_profiles_insert_self on talent_profiles for insert
  with check (id = auth.uid() or is_staff());

drop policy if exists talent_profiles_update on talent_profiles;
create policy talent_profiles_update on talent_profiles for update
  using (id = auth.uid() or is_staff())
  with check (id = auth.uid() or is_staff());

drop policy if exists talent_profiles_delete_admin on talent_profiles;
create policy talent_profiles_delete_admin on talent_profiles for delete
  using (is_admin());

-- ---------------------------------------------------------------------
-- talent_evidence — never publicly visible; only the owner and staff.
-- Only staff can approve/reject (update), so talent cannot self-verify.
-- ---------------------------------------------------------------------

drop policy if exists talent_evidence_select on talent_evidence;
create policy talent_evidence_select on talent_evidence for select
  using (talent_id = auth.uid() or is_staff());

drop policy if exists talent_evidence_insert on talent_evidence;
create policy talent_evidence_insert on talent_evidence for insert
  with check (talent_id = auth.uid() or is_staff());

drop policy if exists talent_evidence_update_staff on talent_evidence;
create policy talent_evidence_update_staff on talent_evidence for update
  using (is_staff())
  with check (is_staff());

drop policy if exists talent_evidence_delete_admin on talent_evidence;
create policy talent_evidence_delete_admin on talent_evidence for delete
  using (is_admin());

-- ---------------------------------------------------------------------
-- verification_events — immutable audit log. Select only; insert is
-- staff-only, and only via the backend API in practice (§9.4 evidence
-- standards: every tier change must record who changed it and when).
-- ---------------------------------------------------------------------

drop policy if exists verification_events_select on verification_events;
create policy verification_events_select on verification_events for select
  using (talent_id = auth.uid() or is_staff());

drop policy if exists verification_events_insert_staff on verification_events;
create policy verification_events_insert_staff on verification_events for insert
  with check (is_staff());

-- ---------------------------------------------------------------------
-- organisations — private business data; not public. Own representative
-- and staff only, per §7.3 ("employer cannot access unrestricted talent
-- contact or private documents" — the same discretion applies in reverse).
-- ---------------------------------------------------------------------

drop policy if exists organisations_select on organisations;
create policy organisations_select on organisations for select
  using (representative_id = auth.uid() or is_staff());

drop policy if exists organisations_insert on organisations;
create policy organisations_insert on organisations for insert
  with check (representative_id = auth.uid() or is_staff());

drop policy if exists organisations_update on organisations;
create policy organisations_update on organisations for update
  using (representative_id = auth.uid() or is_staff())
  with check (representative_id = auth.uid() or is_staff());

drop policy if exists organisations_delete_admin on organisations;
create policy organisations_delete_admin on organisations for delete
  using (is_admin());

-- ---------------------------------------------------------------------
-- opportunities — visible to their own org, staff, and (once approved
-- + public) anyone — this is the future public Jobs & Projects listing.
-- ---------------------------------------------------------------------

drop policy if exists opportunities_select on opportunities;
create policy opportunities_select on opportunities for select
  using (
    is_org_representative(organisation_id)
    or is_staff()
    or (status = 'open' and visibility = 'public')
  );

drop policy if exists opportunities_insert on opportunities;
create policy opportunities_insert on opportunities for insert
  with check (is_org_representative(organisation_id) or is_staff());

drop policy if exists opportunities_update on opportunities;
create policy opportunities_update on opportunities for update
  using (is_org_representative(organisation_id) or is_staff())
  with check (is_org_representative(organisation_id) or is_staff());

drop policy if exists opportunities_delete_admin on opportunities;
create policy opportunities_delete_admin on opportunities for delete
  using (is_admin());

-- ---------------------------------------------------------------------
-- applications — the curated-shortlist model: an employer only sees an
-- application once it's past the raw "submitted" stage (i.e. once a
-- matcher has actually shortlisted it), never the full applicant pool.
-- ---------------------------------------------------------------------

drop policy if exists applications_select on applications;
create policy applications_select on applications for select
  using (
    talent_id = auth.uid()
    or is_staff()
    or (stage <> 'submitted' and exists (
      select 1 from opportunities o
      where o.id = applications.opportunity_id
        and is_org_representative(o.organisation_id)
    ))
  );

drop policy if exists applications_insert on applications;
create policy applications_insert on applications for insert
  with check (
    is_staff()
    or (talent_id = auth.uid() and source = 'applied')
  );

drop policy if exists applications_update_staff on applications;
create policy applications_update_staff on applications for update
  using (is_staff())
  with check (is_staff());

drop policy if exists applications_delete_admin on applications;
create policy applications_delete_admin on applications for delete
  using (is_admin());

-- ---------------------------------------------------------------------
-- engagements — staff manage these directly (§6.7 "one accountable
-- owner"); talent/employer can view their own but changes go through
-- the API so engagement_events always gets the audit row.
-- ---------------------------------------------------------------------

drop policy if exists engagements_select on engagements;
create policy engagements_select on engagements for select
  using (
    talent_id = auth.uid()
    or is_org_representative(organisation_id)
    or is_staff()
  );

drop policy if exists engagements_insert_staff on engagements;
create policy engagements_insert_staff on engagements for insert
  with check (is_staff());

drop policy if exists engagements_update_staff on engagements;
create policy engagements_update_staff on engagements for update
  using (is_staff())
  with check (is_staff());

drop policy if exists engagements_delete_admin on engagements;
create policy engagements_delete_admin on engagements for delete
  using (is_admin());

-- ---------------------------------------------------------------------
-- engagement_events — immutable audit log, same visibility as the
-- parent engagement; writes are staff/API-only.
-- ---------------------------------------------------------------------

drop policy if exists engagement_events_select on engagement_events;
create policy engagement_events_select on engagement_events for select
  using (is_engagement_participant(engagement_id) or is_staff());

drop policy if exists engagement_events_insert_staff on engagement_events;
create policy engagement_events_insert_staff on engagement_events for insert
  with check (is_staff());

-- ---------------------------------------------------------------------
-- finance_records — participants can see their own invoices/deposits/
-- payouts; only finance/admin staff can create or edit records.
-- ---------------------------------------------------------------------

drop policy if exists finance_records_select on finance_records;
create policy finance_records_select on finance_records for select
  using (is_engagement_participant(engagement_id) or is_staff());

drop policy if exists finance_records_insert_finance on finance_records;
create policy finance_records_insert_finance on finance_records for insert
  with check (is_finance_staff());

drop policy if exists finance_records_update_finance on finance_records;
create policy finance_records_update_finance on finance_records for update
  using (is_finance_staff())
  with check (is_finance_staff());

drop policy if exists finance_records_delete_admin on finance_records;
create policy finance_records_delete_admin on finance_records for delete
  using (is_admin());

-- ---------------------------------------------------------------------
-- reviews — visible to the two engagement participants and staff only
-- (not public yet — public case studies go through the separate,
-- consent-based methodology in Blueprint §6.8, not raw review dumps).
-- Immutable once submitted: no update policy for regular users.
-- ---------------------------------------------------------------------

drop policy if exists reviews_select on reviews;
create policy reviews_select on reviews for select
  using (is_engagement_participant(engagement_id) or is_staff());

drop policy if exists reviews_insert on reviews;
create policy reviews_insert on reviews for insert
  with check (
    is_staff()
    or (reviewer_id = auth.uid() and is_engagement_participant(engagement_id))
  );

-- ---------------------------------------------------------------------
-- disputes — raised by either engagement participant; resolved by staff.
-- ---------------------------------------------------------------------

drop policy if exists disputes_select on disputes;
create policy disputes_select on disputes for select
  using (is_engagement_participant(engagement_id) or is_staff());

drop policy if exists disputes_insert on disputes;
create policy disputes_insert on disputes for insert
  with check (
    is_staff()
    or (raised_by = auth.uid() and is_engagement_participant(engagement_id))
  );

drop policy if exists disputes_update_staff on disputes;
create policy disputes_update_staff on disputes for update
  using (is_staff())
  with check (is_staff());

drop policy if exists disputes_delete_admin on disputes;
create policy disputes_delete_admin on disputes for delete
  using (is_admin());

-- ---------------------------------------------------------------------
-- intake_submissions — this is the ONE table the public website writes
-- to directly (via the Supabase anon key). Anyone can insert; nobody
-- but staff can ever read it back, including the person who submitted
-- it — matches the public forms being one-way "submit and we'll follow
-- up", not a mailbox the sender can browse.
-- ---------------------------------------------------------------------

drop policy if exists intake_submissions_insert_public on intake_submissions;
create policy intake_submissions_insert_public on intake_submissions for insert
  with check (true);

drop policy if exists intake_submissions_select_staff on intake_submissions;
create policy intake_submissions_select_staff on intake_submissions for select
  using (is_staff());

drop policy if exists intake_submissions_update_staff on intake_submissions;
create policy intake_submissions_update_staff on intake_submissions for update
  using (is_staff())
  with check (is_staff());

drop policy if exists intake_submissions_delete_admin on intake_submissions;
create policy intake_submissions_delete_admin on intake_submissions for delete
  using (is_admin());
