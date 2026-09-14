-- AdorWorks — Stage 6 gap-check finding: talent-evidence (created 0004,
-- well before Stage 6) is the one talent storage bucket 0055 missed when
-- it hardened talent-avatars/talent-portfolio to match what their upload
-- components already claimed to enforce in client-side JS only. Both
-- upload paths into this bucket — platform/src/app/passport/
-- evidence-manager.tsx and onboarding/verification/verification-form.tsx
-- — already claim 8MB / jpeg,png,webp,pdf; this just makes the storage
-- layer actually enforce it too, so a direct API call bypassing the UI
-- can't upload anything of any size, same fix as 0055 for the other two.

update storage.buckets
set file_size_limit = 8388608, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
where id = 'talent-evidence';

-- Rollback: update storage.buckets set file_size_limit = null, allowed_mime_types = null where id = 'talent-evidence';
