-- AdorWorks — Stage 1 foundations: widen organisation_members.role to make
-- room for finer-grained employer-side permission scopes (recruiter,
-- hiring manager, finance, viewer — see the master implementation
-- document's Part VI §27). This migration is schema-readiness only: no
-- application code writes any of the new values yet, and every existing
-- 'member'/'admin' row and RLS policy keeps its exact current meaning.
-- Enforcement of the new scopes is a later stage's job, not this one's.
--
-- Run this AFTER 0032_assistance_expiry_and_consent_guards.sql.

alter table organisation_members drop constraint if exists organisation_members_role_check;
alter table organisation_members add constraint organisation_members_role_check
  check (role in ('member', 'admin', 'recruiter', 'hiring_manager', 'finance', 'viewer'));

-- Rollback: revert to the original two-value constraint (safe as long as no
-- row has been given a new-scope value yet, which nothing in application
-- code does as of this migration).
--   alter table organisation_members drop constraint if exists organisation_members_role_check;
--   alter table organisation_members add constraint organisation_members_role_check
--     check (role in ('member', 'admin'));
