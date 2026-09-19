-- AdorWorks — S14-09 gap-check finding: org-logos (created 0029) and
-- org-documents (created 0004) are the org-side counterparts of
-- talent-avatars and talent-evidence, both of which were hardened in
-- 0055/0069 to make the storage layer actually enforce what their
-- upload components already claimed client-side only. org-logos and
-- org-documents were simply missed — a direct Storage API call using a
-- valid org representative's own JWT could bypass logo-upload.tsx's
-- 4MB/jpg-png-webp check or evidence-upload.tsx's 8MB/jpg-png-webp-pdf
-- check entirely. This closes that gap with the same limits those
-- components already enforce client-side.

update storage.buckets
set file_size_limit = 4194304, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'org-logos';

update storage.buckets
set file_size_limit = 8388608, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
where id = 'org-documents';

-- Rollback:
-- update storage.buckets set file_size_limit = null, allowed_mime_types = null where id = 'org-logos';
-- update storage.buckets set file_size_limit = null, allowed_mime_types = null where id = 'org-documents';
