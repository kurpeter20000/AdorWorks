-- AdorWorks — S14-11 gap-check finding: risk_flags (0083) used a single
-- "for all" policy granting staff SELECT *and* INSERT/UPDATE/DELETE
-- directly via RLS — unlike every other audit-adjacent table
-- (audit_events, verification_events, engagement_events,
-- assisted_field_changes), which restrict direct client writes and
-- rely on the service-role backend/api route (which calls
-- logAuditEvent for every raise/resolve) to be the only write path.
-- Under the old policy, a staff account could silently UPDATE or
-- DELETE an existing fraud/scam flag through their own session,
-- bypassing backend/api/src/routes/riskFlags.js entirely and leaving
-- no audit_events trail — the exact "deleting evidence of their own
-- misconduct" scenario docs/governance/threat-model.md already claims
-- is mitigated for every audit-adjacent table. This migration makes
-- that claim true for risk_flags too, matching the others: staff can
-- SELECT directly, but INSERT/UPDATE/DELETE now require the
-- service-role client, which only backend/api's audited route uses.

drop policy if exists risk_flags_staff_all on risk_flags;
create policy risk_flags_staff_select on risk_flags for select
  using (is_staff());

-- Rollback:
-- drop policy if exists risk_flags_staff_select on risk_flags;
-- create policy risk_flags_staff_all on risk_flags for all using (is_staff()) with check (is_staff());
