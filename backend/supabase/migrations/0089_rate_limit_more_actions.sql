-- AdorWorks — S14-05 gap-check finding: the S04-05 audit's own
-- follow-up (Stage 14 security review) confirmed rate limiting only
-- ever covered login/signup/password-reset — invitations, reports,
-- and MFA-challenge verification had no limit at all. mfa_challenge is
-- the most severe: a staff account with a stolen password but no
-- authenticator device could otherwise brute-force a 6-digit TOTP code
-- indefinitely. Widens the existing check constraint rather than
-- adding a new table, matching the identical pattern
-- platform/src/lib/domain/rateLimit.ts already uses.

alter table auth_rate_limit_attempts drop constraint auth_rate_limit_attempts_action_check;
alter table auth_rate_limit_attempts add constraint auth_rate_limit_attempts_action_check
  check (action in ('login', 'signup', 'password_reset_request', 'mfa_challenge', 'report', 'invitation'));

-- Rollback:
-- alter table auth_rate_limit_attempts drop constraint auth_rate_limit_attempts_action_check;
-- alter table auth_rate_limit_attempts add constraint auth_rate_limit_attempts_action_check
--   check (action in ('login', 'signup', 'password_reset_request'));
