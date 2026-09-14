# Stage 6 — Portfolio, video and media trust

Status: **Complete, verified live.** This stage's real build (talent
introduction video, moderation queue, private/signed video storage,
portfolio reordering, reporting granularity) already landed before this
governance process reached Stage 6 — see `docs/stage-6-portfolio-video-and-media-trust.md`
for the original implementation writeup. That doc's own "Known gap"
flagged that, unlike Stages 2-5, it had never been through an
independent gap-check pass. This is that pass: every claim in the
original doc was re-verified against the current code and, where
possible, against the live staging Supabase project — and it found two
real, live-confirmed gaps, both fixed below.

## What was re-verified and confirmed accurate

- **`talent_introduction_videos` (migration 0055)** — table shape, RLS
  (owner + staff + `status = 'approved'` for public visibility), and the
  "any talent edit resets to pending" update policy all match the
  original doc exactly, read directly from the migration file.
- **Private bucket, real limits** — confirmed live against the test
  Supabase project: `talent-videos` is private, 100MB cap, mp4/webm/mov
  only.
- **Upload UX** (`introduction-video-manager.tsx`) — real XHR-based
  upload progress, a client-side 3-minute duration check, and a
  canvas-captured thumbnail are all genuinely implemented, not just
  described. The file input isn't in a flex row next to a fixed-width
  sibling (the pattern that caused S05-13's mobile-overflow bug in
  `avatar-upload.tsx`), so no analogous risk here.
- **Staff review queue** — `GET /api/talent/pending-videos` (gated by
  the router-level `requireAuth, requireStaff`), the
  `pending-videos-section` panel on `staff/talent.html`, the approve/
  reject actions calling `POST /:id/introduction-video/review`, and the
  dashboard tile (`stat-pending-videos` in `staff/js/dashboard.js`) are
  all present and wired correctly.
- **Notifications** — `INTRODUCTION_VIDEO_REVIEWED` is a registered
  type and the review endpoint sends one on both approve and reject;
  the notifications list renders it correctly since it's fully generic
  (title/body, no per-type switch needed).
- **Portfolio reordering** — `talent_portfolio_items_update` policy
  (0056) exists, and `portfolio-manager.tsx` has real up/down reorder
  buttons using the same full-resequencing pattern as
  `work-experience-manager.tsx`/`education-manager.tsx`.
- **Reporting granularity** — `reports.target_type` genuinely accepts
  `talent_video`/`portfolio_item` at the DB layer (0056), `ReportButton`
  is wired on both the video and each portfolio item on the public
  passport page, and report *submission* works end to end (it inserts
  directly via RLS from `platform/src/lib/actions/reports.ts`, which
  types `targetType` from `ReportTargetType` — already correctly
  including both new values, not hardcoded separately).

## Gaps found and fixed

| Finding | Fix | Verified |
|---|---|---|
| **`talent-evidence` storage bucket had zero server-side size/type enforcement** — created in migration `0004`, well before Stage 6, and missed when `0055` hardened `talent-avatars`/`talent-portfolio` to match what their upload components already claimed client-side. Both upload paths into this bucket (`evidence-manager.tsx`, `onboarding/verification/verification-form.tsx`) already claim 8MB / jpeg,png,webp,pdf in their own JS — a direct API call bypassing the UI could previously upload anything, of any size. | New migration `0069` sets `file_size_limit`/`allowed_mime_types` on the bucket to match what the UI already claims. | Live: confirmed the bucket's stored limits, then did a real upload round-trip — a `.exe`-typed file and a 9MB file are both now rejected server-side, a valid small PDF still succeeds. |
| **Staff-facing report filtering was broken for the two new target types** — `backend/api/src/routes/reports.js`'s `TARGET_TYPES` array (used only to validate the optional `?target_type=` query filter on `GET /api/reports`, not report creation) was never updated when `0056` widened the DB's check constraint, so filtering the staff queue by `talent_video` or `portfolio_item` would 400. Report *submission* itself was never affected — that goes through Supabase RLS directly, not this endpoint. Currently dead in practice (the staff reports UI has no target-type filter control yet), but a real latent bug. | Added the two missing values to the array. | Confirmed the corrected zod schema now parses both values; full backend suite still green (38/38). |

## Worth your attention — found here, out of Stage 6's scope

While checking every storage bucket's live limits, four more had the
same "zero server-side enforcement" gap as the one just fixed here, but
belong to other features Stage 6 doesn't cover — flagging rather than
guessing at the right limits and fixing them unscoped:

- `org-documents`, `deliverables`, `message-attachments` — no size/type
  cap at all.
- `org-logos` — public, no size/type cap either.

Unlike `talent-evidence`, none of these have an obvious "already
claimed client-side, just match it" answer readily at hand from this
pass — worth a proper look (what should actually be allowed into each)
whichever stage covers organisations/contracts/messaging next, rather
than guessed at here.

## Migrations added this pass

- `0069_talent_evidence_bucket_hardening.sql`

## Tests

Backend: 38/38 (unchanged pass count — the fix is a one-line array,
no existing test covered this path either way). Platform: unaffected
(no platform code changed in this pass).
