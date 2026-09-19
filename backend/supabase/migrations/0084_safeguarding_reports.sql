-- AdorWorks — S10-10: safeguarding and PSEA (Protection from Sexual
-- Exploitation and Abuse) escalation handling.
--
-- The 2026-09-19 audit found zero implementation behind the marketing
-- copy on trust-safety.html/community-standards.html: no safeguarding
-- category existed in `reports.reason` at all, and every report — no
-- matter how sensitive — was visible to every staff role identically
-- (is_staff() only).
--
-- This is a structural fix, not a policy one: WHO the ultimately
-- responsible, named safeguarding contact is (per S10-10's own wording,
-- "route to named responsible people") is the founder's call, not an
-- engineering one, and hasn't been made yet. Admin-only is the most
-- restrictive, safest default available without inventing a specific
-- person — every admin account already goes through a maker-checker
-- promotion (0036) and MFA (S04-08), so this isn't a weak stand-in. If
-- the founder later designates a smaller, specific group (e.g. one named
-- person, not "every admin"), that's a follow-up migration once that
-- decision is made, not something to guess at now.
--
-- Run this AFTER 0083_risk_flags.sql.

alter table reports drop constraint if exists reports_reason_check;
alter table reports add constraint reports_reason_check check (reason in ('spam', 'scam', 'inappropriate', 'misleading', 'safeguarding', 'other'));

drop policy if exists reports_select on reports;
create policy reports_select on reports for select
  using (
    reporter_id = auth.uid()
    or (is_staff() and (reason <> 'safeguarding' or is_admin()))
  );

drop policy if exists reports_staff_update on reports;
create policy reports_staff_update on reports for update
  using (is_staff() and (reason <> 'safeguarding' or is_admin()))
  with check (is_staff() and (reason <> 'safeguarding' or is_admin()));

-- Rollback: recreate reports_reason_check without 'safeguarding'; recreate
-- reports_select/reports_staff_update exactly as 0047 defined them.
