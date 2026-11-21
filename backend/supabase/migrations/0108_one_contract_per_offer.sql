-- One contract per offer, enforced by the database.
--
-- acceptOffer / acceptServiceProposal (platform/src/lib/actions/offers.ts)
-- now claim the offer atomically (update ... where status = 'sent'), so a
-- double-tap or two org members accepting at once can no longer create two
-- contracts. This index is the second, independent layer: even if a future
-- code path forgets the claim, the second insert fails instead of silently
-- creating a duplicate contract (and duplicate milestones/payments).
--
-- If this migration fails with the "duplicate contracts" error below,
-- production already has duplicates from before the fix. Find them with:
--
--   select offer_id, array_agg(id order by created_at) as contract_ids
--   from contracts where offer_id is not null
--   group by offer_id having count(*) > 1;
--
-- and resolve them by hand (cancel the extra contract) before re-running.

do $$
begin
  if exists (
    select 1 from contracts
    where offer_id is not null
    group by offer_id having count(*) > 1
  ) then
    raise exception 'duplicate contracts exist for at least one offer — see the comment at the top of 0108_one_contract_per_offer.sql';
  end if;
end;
$$;

create unique index if not exists contracts_offer_id_uidx
  on contracts(offer_id)
  where offer_id is not null;
