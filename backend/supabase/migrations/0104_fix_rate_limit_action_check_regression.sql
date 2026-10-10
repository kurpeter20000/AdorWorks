-- AdorWorks — hotfix: 0103_public_chat.sql rebuilt this constraint from
-- 0089's list ('login', 'signup', 'password_reset_request',
-- 'mfa_challenge', 'report', 'invitation') + 'public_chat', but forgot
-- 'file_upload' — added later by 0094 and never folded back in. 0094's
-- guard_storage_upload_rate_limit() trigger fires on every single
-- storage.objects insert (every upload in the app: avatars, logos,
-- portfolio/evidence files, identity documents, org documents, opportunity
-- attachments, CVs) and inserts action = 'file_upload' into this table.
-- Since 0103 shipped, that insert has been rejected with 23514
-- (check_violation), which aborts the triggering storage.objects insert —
-- so every non-staff upload has been failing with "database error, code:
-- 23514" since 2026-10-04.
--
-- Rollback:
--   alter table auth_rate_limit_attempts drop constraint auth_rate_limit_attempts_action_check;
--   alter table auth_rate_limit_attempts add constraint auth_rate_limit_attempts_action_check
--     check (action in ('login', 'signup', 'password_reset_request', 'mfa_challenge', 'report', 'invitation', 'public_chat'));

alter table auth_rate_limit_attempts drop constraint auth_rate_limit_attempts_action_check;
alter table auth_rate_limit_attempts add constraint auth_rate_limit_attempts_action_check
  check (action in (
    'login', 'signup', 'password_reset_request', 'mfa_challenge',
    'report', 'invitation', 'file_upload', 'public_chat'
  ));
