-- AdorWorks — two more gaps in the same class 0008/0010 already fixed,
-- found while building the application/shortlist/offer flow in the
-- Next.js app (platform/src/lib/actions/offers.ts).
--
-- 1. offers_insert (0007) lets an org member insert an offer row with
--    ANY status, not just the 'draft' default — 0007's own comment says
--    "Sending an offer... go through a Server Action", but nothing
--    actually stopped a direct REST insert with status = 'sent' or even
--    'accepted' from the start, skipping the talent's actual consent.
--    Fix: BEFORE INSERT guard, same pattern as 0010.
--
-- 2. contracts_insert (0007) has three OR'd branches: is_staff(),
--    is_org_member(organisation_id), or "talent whose offer was
--    accepted". The middle branch lets an org create a contract for
--    itself at any time, for any talent, with no accepted offer (or any
--    offer at all) behind it — the org-consent side of "both parties
--    agreed" was never actually enforced, only the talent's side was.
--    Fix: drop that branch. Contract creation now requires either staff
--    (service_role, from a Server Action) or the talent's own already-
--    accepted offer — matching the comment's stated intent, not just
--    its wording.
--
-- Run this AFTER 0010_prevent_self_escalation_on_insert.sql.

create or replace function guard_offers_insert()
returns trigger language plpgsql as $$
begin
  perform reject_unless_staff(new.status <> 'draft', 'Offers must be created as drafts; sending one is a separate step.');
  return new;
end;
$$;
drop trigger if exists guard_offers_insert on offers;
create trigger guard_offers_insert before insert on offers
  for each row execute function guard_offers_insert();

drop policy if exists contracts_insert on contracts;
create policy contracts_insert on contracts for insert
  with check (
    is_staff()
    or exists (select 1 from offers o where o.id = offer_id and o.talent_id = auth.uid() and o.status = 'accepted')
  );
