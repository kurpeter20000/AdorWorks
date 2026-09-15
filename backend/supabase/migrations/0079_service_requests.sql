-- AdorWorks — S09-03: complete employer service requests.
--
-- The Stage 9 audit found services were browse-only: an employer could
-- Save, Dismiss, Report, or view the talent's profile from a published
-- service listing — no "request this service" action existed anywhere.
-- This is the first of three linked pieces (S09-03/04/05): a request
-- (this migration), a proposal in response (0080, reusing `offers`), and
-- offer acceptance/decline (also 0080, new actions on the existing
-- accept/decline pattern).
--
-- Every status transition after creation goes through a Server Action
-- using the admin client with an explicit ownership + status check —
-- same reasoning 0050_employer_invitations.sql already established for
-- this project's other propose/respond flow (talent accept/decline of an
-- opportunity invitation): responding has side effects (creating an
-- offer, later a contract) that don't belong in a bare client PATCH.
--
-- Run this AFTER 0078_application_drafts.sql.

create table if not exists service_requests (
  id uuid primary key default gen_random_uuid(),
  talent_service_id uuid not null references talent_services(id) on delete cascade,
  organisation_id uuid not null references organisations(id) on delete cascade,
  talent_id uuid not null references talent_profiles(id) on delete cascade,
  requested_by uuid not null references profiles(id),
  message text,
  status text not null default 'pending' check (status in ('pending', 'proposed', 'accepted', 'declined', 'withdrawn')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create index if not exists service_requests_talent_idx on service_requests(talent_id);
create index if not exists service_requests_org_idx on service_requests(organisation_id);
create index if not exists service_requests_service_idx on service_requests(talent_service_id);

alter table service_requests enable row level security;

drop policy if exists service_requests_select on service_requests;
create policy service_requests_select on service_requests for select
  using (talent_id = auth.uid() or is_org_member(organisation_id) or is_staff());

-- Only against a currently published service, and the talent_id on the
-- request must match that service's real owner — prevents a client from
-- requesting one talent's service while naming a different talent_id.
drop policy if exists service_requests_insert on service_requests;
create policy service_requests_insert on service_requests for insert
  with check (
    requested_by = auth.uid()
    and is_org_write_member(organisation_id)
    and exists (
      select 1 from talent_services ts
      where ts.id = talent_service_id and ts.talent_id = service_requests.talent_id and ts.status = 'published'
    )
  );

drop policy if exists service_requests_staff_all on service_requests;
create policy service_requests_staff_all on service_requests for all
  using (is_staff())
  with check (is_staff());

-- Rollback: drop table service_requests.
