-- AdorWorks' own collection accounts (owner request, 2026-11-21).
--
-- Finance staff now record AdorWorks' MTN MoMo and mGurush accounts in
-- Settings (platform_settings key 'collection_accounts', no schema
-- change needed), next to the bank account from 0116. Each payment now
-- notes which AdorWorks account it was received into, so the commission
-- (employer fee + talent fee) can be totalled per account.
--
-- Safe to re-run. Run AFTER 0116.

alter table payment_events add column if not exists received_into text;

comment on column payment_events.received_into is
  'The AdorWorks account the payment landed in, as it was at the time, e.g. "MTN MoMo · AdorWorks Ltd · +211912345678".';
