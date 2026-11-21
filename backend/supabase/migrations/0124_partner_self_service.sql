-- Partner self-service (owner decision, 2026-11-21): programme partners
-- who are already employers on AdorWorks (e.g. EduPower Youth Foundation)
-- create their own Pathways cohorts and invite their own team from their
-- employer account. AdorWorks staff keep two things: recording facilitator
-- background checks (safeguarding) and the data-sharing agreement.
--
-- 1. organisations.is_programme_partner: staff approve an organisation as
--    a programme partner. Its organisation admins can then create cohorts.
-- 2. programmes.partner_organisation_id: which partner organisation a
--    cohort belongs to (its admins manage it).
-- 3. programme_partner_users.role: 'admin' (manage the cohort and its team)
--    or 'viewer' (see results only).
--
-- Safe to re-run. Run AFTER 0123.

alter table organisations add column if not exists is_programme_partner boolean not null default false;
alter table programmes add column if not exists partner_organisation_id uuid references organisations(id);
create index if not exists programmes_partner_org_idx on programmes(partner_organisation_id);
alter table programme_partner_users add column if not exists role text not null default 'viewer';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'programme_partner_users_role_check') then
    alter table programme_partner_users add constraint programme_partner_users_role_check check (role in ('admin', 'viewer'));
  end if;
end $$;
