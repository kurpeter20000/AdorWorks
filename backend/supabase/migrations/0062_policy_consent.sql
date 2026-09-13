-- AdorWorks — S04-09: record acceptance of Terms of Use / Privacy
-- Policy at signup. Real Terms/Privacy pages already exist
-- (terms.html, privacy.html, both "Version 1.0") but nothing recorded
-- that a person actually agreed to them — profiles.consent_terms_at
-- (0001_schema.sql) is a different, talent-only declaration ("I
-- consent to be considered/published" at onboarding review, see
-- platform/src/lib/actions/onboarding.ts's confirmPublicationConsent)
-- and was never meant to double as ToS/Privacy acceptance.
--
-- New columns, separate from consent_terms_at on purpose:
--   policy_consent_at     — when they agreed
--   policy_version        — which version of the combined Terms of Use
--                           + Privacy Policy they agreed to (both pages
--                           are versioned together, "Version 1.0" as of
--                           this migration)
--   policy_consent_source — where the agreement was captured (e.g.
--                           'signup_form') — the tracker's own wording
--                           ("consent source") asks for this explicitly
--
-- Applies to every account type (talent and employer both sign up
-- through the same form/action), set via the same
-- raw_user_meta_data -> handle_new_auth_user() trigger pattern 0009
-- already established for intended_role, for the same reason: signUp()
-- doesn't establish a session until email confirmation, so a follow-up
-- update as that user would silently affect zero rows under RLS.
-- Unlike intended_role, this metadata isn't whitelisted against a safe
-- set — recording "yes, this browser said it agreed" carries no
-- privilege-escalation risk the way self-selecting a role would.

alter table profiles
  add column if not exists policy_consent_at timestamptz,
  add column if not exists policy_version text,
  add column if not exists policy_consent_source text;

create or replace function handle_new_auth_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  requested_role text;
  resolved_role user_role;
begin
  requested_role := new.raw_user_meta_data ->> 'intended_role';
  if requested_role in ('talent', 'individual_client') then
    resolved_role := requested_role::user_role;
  else
    resolved_role := 'talent';
  end if;

  insert into public.profiles (
    id, role, full_name, phone, email_verified,
    policy_consent_at, policy_version, policy_consent_source
  )
  values (
    new.id,
    resolved_role,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone',
    new.email_confirmed_at is not null,
    case when new.raw_user_meta_data ->> 'policy_version' is not null then now() else null end,
    new.raw_user_meta_data ->> 'policy_version',
    case when new.raw_user_meta_data ->> 'policy_version' is not null then 'signup_form' else null end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Rollback: alter table profiles drop column policy_consent_at, drop
-- column policy_version, drop column policy_consent_source; then
-- recreate handle_new_auth_user() as it was in 0009 (without the three
-- new fields in the insert).
