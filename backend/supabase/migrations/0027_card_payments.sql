-- Adds a third simulated payment provider — card (Visa/Mastercard) — for
-- payers (NGOs, corporates) more likely to pay by card than mobile
-- money. Same boundary as m-Gurush/MTN MoMo: fully simulated, no real
-- processor involved, no card data actually needs to be PCI-scoped here
-- since nothing is ever really charged.
--
-- payment_intentions.provider has an inline CHECK (not an enum type),
-- so widening it means dropping and recreating that constraint — found
-- dynamically by column reference rather than a guessed system-generated
-- name, so this can't silently leave the old, narrower constraint in
-- place alongside the new one.

do $$
declare
  con record;
begin
  for con in
    select c.conname
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    where rel.relname = 'payment_intentions'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%provider%'
  loop
    execute format('alter table payment_intentions drop constraint %I', con.conname);
  end loop;
end $$;

alter table payment_intentions
  add constraint payment_intentions_provider_check
  check (provider in ('mgurush', 'mtn_momo', 'visa_mastercard'));

alter table payment_intentions add column if not exists card_last4 text;
alter table payment_intentions add column if not exists card_brand text;

alter table payment_events add column if not exists card_last4 text;
alter table payment_events add column if not exists card_brand text;
