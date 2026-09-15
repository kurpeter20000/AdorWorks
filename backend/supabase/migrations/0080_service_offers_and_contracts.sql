-- AdorWorks — S09-04/S09-05: proposal creation/response and service offer
-- acceptance/decline, reusing the existing offers/contracts machinery
-- (milestones, payments, disputes, reviews, messaging all already hang
-- off contract_id, not opportunity_id — confirmed by reading every one of
-- those code paths before this migration) rather than duplicating that
-- entire lifecycle a second time for services.
--
-- A service-originated offer is the talent's PROPOSAL (price, timeline,
-- message) in response to a service_request — the direction is reversed
-- from a job offer: the talent is the one creating it (via
-- submitServiceProposal, an admin-client Server Action mirroring
-- sendOffer's own pattern), and the organisation is the one who accepts
-- or declines it (acceptServiceProposal/declineServiceProposal, mirroring
-- acceptOffer/declineOffer with the actor reversed). offers.created_by
-- still just means "who created this row", which is why no schema change
-- is needed there — the reversal is entirely in which Server Action is
-- used, not in the table shape.
--
-- Run this AFTER 0079_service_requests.sql.

alter table offers add column if not exists service_request_id uuid references service_requests(id) on delete cascade;
alter table offers alter column application_id drop not null;
alter table offers alter column opportunity_id drop not null;

alter table offers drop constraint if exists offers_origin_check;
alter table offers add constraint offers_origin_check check (
  (application_id is not null and opportunity_id is not null and service_request_id is null)
  or (application_id is null and opportunity_id is null and service_request_id is not null)
);

alter table contracts add column if not exists service_request_id uuid references service_requests(id) on delete restrict;
alter table contracts alter column opportunity_id drop not null;

alter table contracts drop constraint if exists contracts_origin_check;
alter table contracts add constraint contracts_origin_check check (
  (opportunity_id is not null and service_request_id is null)
  or (opportunity_id is null and service_request_id is not null)
);

-- Rollback: drop constraints offers_origin_check/contracts_origin_check;
-- drop column offers.service_request_id, contracts.service_request_id;
-- restoring application_id/opportunity_id to not null is only safe if no
-- service-originated row exists yet.
