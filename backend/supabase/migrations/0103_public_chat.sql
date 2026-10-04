-- AdorWorks — public-site AI chat widget: rate limiting for an
-- unauthenticated endpoint, and a new intake_submissions form_type for
-- when a visitor asks to talk to a human instead of the bot.
--
-- Rollback:
--   alter table auth_rate_limit_attempts drop constraint auth_rate_limit_attempts_action_check;
--   alter table auth_rate_limit_attempts add constraint auth_rate_limit_attempts_action_check
--     check (action in ('login', 'signup', 'password_reset_request', 'mfa_challenge', 'report', 'invitation'));
--   alter table intake_submissions drop constraint intake_submissions_form_type_check;
--   alter table intake_submissions add constraint intake_submissions_form_type_check
--     check (form_type in ('talent_application', 'employer_brief', 'shortlist_request',
--       'service_request', 'general_contact', 'insights_subscribe'));

alter table auth_rate_limit_attempts drop constraint auth_rate_limit_attempts_action_check;
alter table auth_rate_limit_attempts add constraint auth_rate_limit_attempts_action_check
  check (action in ('login', 'signup', 'password_reset_request', 'mfa_challenge', 'report', 'invitation', 'public_chat'));

alter table intake_submissions drop constraint intake_submissions_form_type_check;
alter table intake_submissions add constraint intake_submissions_form_type_check
  check (form_type in (
    'talent_application', 'employer_brief', 'shortlist_request',
    'service_request', 'general_contact', 'insights_subscribe', 'chatbot_escalation'
  ));
