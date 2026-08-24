-- 0026 created payment_intentions.payer_phone as NOT NULL, before card
-- payments (0027) existed. A card payment's payMilestone action correctly
-- passes payer_phone: null (there's no phone in that checkout), so the
-- NOT NULL constraint would reject every real card payment attempt.
-- Found by testing the constraint directly, not just reading the code.

alter table payment_intentions alter column payer_phone drop not null;
-- payment_events.payer_phone was already added nullable in 0026 (plain
-- `add column ... text`, no NOT NULL) — nothing to fix there.
