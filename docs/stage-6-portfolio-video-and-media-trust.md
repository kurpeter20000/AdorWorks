# Stage 6 — Portfolio, Video and Media Trust

Status: **implemented** (commit `7818143`). Talent video was explicitly
included in this stage per direct product direction: a short bio video —
"who I am, what I do" — so an employer knows who they're trusting with
their work before hiring, not a demo reel and not a verification
substitute.

## What this delivered

- **Talent introduction video** (`0055`, `talent_introduction_videos`) —
  one video per talent (a single introduction, not a gallery). Real staff
  moderation before it's ever publicly visible: `pending` → `approved`/
  `rejected`, and any talent edit (even just fixing the transcript) resets
  to `pending`. Video is a materially higher trust surface than a static
  portfolio image (a real person's face and voice), which is why it gets
  a review step the existing portfolio gallery still doesn't.
- **Private storage + signed playback** — `talent-videos` is a private
  bucket (unlike the existing public `talent-avatars`/`talent-portfolio`),
  with real server-enforced type/size limits (100MB; mp4/webm/mov) set on
  the bucket itself, not just in client-side JS. Public playback works via
  a signed URL generated server-side by the admin client on every
  passport-page render — never persisted anywhere, 1-hour expiry — rather
  than teaching `storage.objects` RLS to reach into two other RLS-protected
  tables.
- **Upload UX** — real progress via a raw `XMLHttpRequest` against
  Supabase Storage's REST endpoint (the Fetch API `supabase-js` uses has
  no upload-progress event at all), a client-side duration check (3-minute
  cap), and a client-side canvas-captured thumbnail — no new external
  video-processing service was added for any of this.
- **Accessibility** — a talent-provided transcript (see the honest scope
  note below) and native `<video controls>`, which is keyboard-operable
  in every major browser without a custom player.
- **Operations queue** — a real "pending review" panel on the staff
  console (`GET /api/talent/pending-videos` + a section on
  `staff/talent.html`), not just a field buried in each talent's own
  detail view — approve/reject follows the same shape as the existing
  evidence-review pattern. A new dashboard tile for visibility.
- **Reporting** — `reports.target_type` widened to `talent_video` and
  `portfolio_item` (previously a report could only point at a talent's
  whole profile, not which specific piece of content was the issue).
- **Portfolio ordering fixed while here** — `talent_portfolio_items.
  sort_order` has existed since Stage 1/pre-governance work but had no
  update policy and nothing ever set it. Added the policy and up/down
  reorder buttons.
- **Storage hardening** — `talent-avatars`/`talent-portfolio` buckets now
  enforce the same type/size limits their upload components already
  claimed to enforce in client-side JS only (found while configuring the
  new video bucket's own limits, and clearly the same class of gap).

## Deliberate, honest scope choices (not gaps — decisions)

- **No external video-processing/transcription service** — every "media
  processing" requirement is met with existing infrastructure or plain
  browser APIs (Supabase Storage, canvas-captured thumbnail, native
  `<video>` playback). No new vendor dependency was added.
- **Transcript, not synced captions** — the talent types/pastes what they
  say; it's shown as expandable text below the video, not a timed `.vtt`
  track. Real captioning would need a transcription service.
- **Retry, not byte-level resume** — a failed upload keeps the selected
  file in memory so retrying doesn't require re-picking it, but it
  restarts the transfer rather than continuing from the last byte (that
  would need the TUS resumable protocol). Reasonable for a capped-length
  bio video; would need revisiting for much larger files.
- **No new appeal mechanism** — a rejected video's "appeal" is the same
  replace-and-resubmit pattern already established for other Stage 3-5
  moderated content, not a separate formal appeal flow.

## Migrations added

Run in order, after `0054_application_truthfulness_correction.sql`:

- `0055_talent_introduction_video.sql`
- `0056_portfolio_ordering_and_video_reports.sql`

Both additive; each documents its own rollback in-file.

## Tests

Platform: 52/52. Backend: 24/24. Full production build passes.

## Known gap

No independent gap-check pass has been run yet against this doc — the
pattern used for Stages 2-5, which found real issues every single time.
