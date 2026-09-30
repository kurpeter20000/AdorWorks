-- AdorWorks — restore employer names on public listings without a
-- security-definer view.
--
-- 0072 created public_organisation_names as a plain view (runs as its
-- owner) so talent and anonymous visitors could see an organisation's
-- name and verification status — never its address, billing email or
-- evidence. Both the test and production projects were later switched
-- to security_invoker = true outside of any migration (most likely via
-- Supabase's "Security Definer View" advisor). Under invoker rights the
-- view is filtered by organisations_select RLS, which only admits
-- members and staff, so every listing fell back to "AdorWorks employer".
--
-- Keeping the view as security_invoker (so the advisor stays clean) and
-- sourcing its rows from a narrowly-scoped SECURITY DEFINER function
-- restores the intended exposure: the same three columns, nothing else.
--
-- Run this AFTER 0094_file_upload_rate_limit.sql.

create or replace function public.public_organisation_names_rows()
returns table (id uuid, name text, verification_status org_verification_status)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.name, o.verification_status from public.organisations o;
$$;

revoke all on function public.public_organisation_names_rows() from public;
grant execute on function public.public_organisation_names_rows() to anon, authenticated;

create or replace view public_organisation_names
  with (security_invoker = true)
as
select id, name, verification_status from public.public_organisation_names_rows();

grant select on public_organisation_names to anon, authenticated;

-- Rollback: drop view public_organisation_names; drop function
-- public.public_organisation_names_rows(); then re-run 0072's
-- create view statement.
