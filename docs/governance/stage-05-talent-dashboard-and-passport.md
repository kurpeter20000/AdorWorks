# Stage 5 — Talent dashboard and passport

Status: **All 13 tracker items complete and verified live.** S05-10's
scope question was resolved by your 2026-09-14 decision (filter/
prioritize the talent's own opportunities feed); S05-04 (education) was
built the same day using the same well-established shape as work
experience, once it was clear its scope was never actually ambiguous —
only S05-10 needed a real product call. Every item was built, verified
against the live staging Supabase project and/or a real running server,
and is described in detail in the table below.

## Phase A audit

| Step ID | What it means | Status | Evidence |
|---|---|---|---|
| S05-01 | Onboarding progress flow | **Complete, verified live** | `platform/src/app/onboarding/page.tsx:11-38` genuinely resumes at the right step. New `OnboardingNav` client component (`onboarding/onboarding-nav.tsx`) replaces the old plain-text nav: past steps are real links (safe to revisit — no guard against re-opening), the current step is highlighted (`aria-current="step"`), future steps stay plain text since reachability isn't knowable from the URL alone. |
| S05-02 | Personal/contact details | **Complete, verified live** | `saveBasics` (`platform/src/lib/actions/onboarding.ts:34-76`) validates and saves correctly; phone/email genuinely stay private (RLS `profiles_select`, `0002_rls.sql:94-95`, and the public view excludes them, `0034_public_talent_profile_safe_projection.sql:21-41`). Former gap (no in-app link back to `/onboarding/basics`) closed: `passport/page.tsx:100-105` now links "Edit your basics, skills and availability" directly from Passport. |
| S05-03 | Skills and service capabilities | **Complete, verified live** | `platform/src/components/skills-input.tsx` is a solid chip editor with real case-insensitive duplicate prevention, now reachable from Passport via the same edit link as S05-02. Reordering still doesn't exist, but wasn't part of the original gap — case-insensitive dedupe was the only functional concern. |
| S05-04 | Education and qualifications | **Complete, verified live** | New `talent_education` table (migration 0067) — institution, qualification, field of study, date range, "currently studying" (null end date, same reasoning as work experience), description, real reorder support. RLS mirrors `talent_work_experience` exactly. New `EducationManager` component (built with the stacked-date-fields layout from day one, learned from S05-13); shown on both the owner's own Passport and the public/preview page. Verified live end to end via a real Playwright session: added a real entry through the actual UI, confirmed it persisted and rendered correctly. |
| S05-05 | Work experience | **Complete, verified live** | New `talent_work_experience` table (migration 0066) — employer, role title, date range, "currently working here" (expressed as a null end date, not a separate flag that could disagree with it), description, real reorder support. RLS mirrors `talent_portfolio_items`' shape exactly, including the update policy from day one (0018 shipped without one, needed 0056 to add it later — not repeating that gap). New `WorkExperienceManager` component; shown on both the owner's own Passport and the public/preview page, clearly labeled separately from the existing "Verified work history" (real completed contracts) so the two are never confused. Verified live: inserted a real row against staging, confirmed the date-order check constraint genuinely rejects a bad range, cleaned up. |
| S05-06 | CV upload and replacement | **Complete, verified live** | Real single-slot `cv_path` on `talent_profiles` (migration 0065), a dedicated `CvUpload` component with genuine replace-in-place semantics, backed by a new **private** `talent-cv` bucket. Verified live: uploaded a test PDF, confirmed the old-style public URL now returns 400 and a signed URL returns 200, then cleaned up. Signed URLs generated server-side (admin client) for the public/preview page, client-side (own session) for the owner's management view. |
| S05-07 | Portfolio and work samples | **Complete, privacy gap closed** | Full CRUD + reorder already existed (`portfolio-manager.tsx`). The `talent-portfolio` bucket is now **private** (migration 0065) — verified live the same way as S05-06 (public URL now 400, signed URL 200). File links in both the owner's management view and the public/preview page now use signed URLs instead of permanent public ones. |
| S05-08 | Availability, location, work preferences | **Complete, verified live** | Real scalar fields on `talent_profiles` (`location`, `work_mode`, `availability` — `0001_schema.sql:104-109`), same access gap as S05-02/03, closed the same way via the Passport edit link. |
| S05-09 | Verification status display | **Complete, verified live** | Passport shows the current tier prominently. Added `rejection_reason` to `talent_evidence` (migration 0064) — the review endpoint (`backend/api/src/routes/talent.js`) now sets it (defaulting to "Not approved." if rejected without one) and sends a notification (`EVIDENCE_REVIEWED`), matching the introduction-video pattern exactly. `evidence-manager.tsx:101-102` surfaces it in coral text. Tier-change history (`verification_events`) still isn't surfaced to the talent — a smaller, separate gap not raised by the original audit language, left as-is. |
| S05-10 | Job/service preference settings | **Complete, verified live** | Scoped by your 2026-09-14 decision to filter/prioritize the talent's own `/opportunities` feed. Reused `talent_profiles.category` and `.work_mode` (already captured at onboarding) rather than duplicating them; added the one genuinely missing piece — `preferred_engagement_type` (migration 0068), matching the existing full_time/freelance_contract bucket the Talent Mode switcher already offers. On a genuinely untouched landing (no explicit filter/search param in the URL, not even a submitted-blank one), `/opportunities` now defaults its category/work-mode/engagement-type filters from the talent's own preferences, with a visible "Showing opportunities matching your job preferences" banner and an explicit "See everything" escape hatch (`?all=1`) — any manual filter choice always overrides the default. Verified live end to end: seeded a matching and a non-matching open opportunity, confirmed the bare feed shows only the matching one with the banner, and that "See everything" reveals both. |
| S05-11 | Profile preview | **Complete, verified live** | `passport/[id]/page.tsx` now has real owner-preview logic (`isOwnerPreview = session?.userId === id`): when the viewer owns the profile, it queries the base `talent_profiles` table directly (via an explicit safe column list) instead of the restricted `public_talent_profiles` view, and shows a "Preview" banner when the profile isn't public yet. A talent can now see their own not-yet-published profile exactly as an employer eventually will. |
| S05-12 | Empty/loading/error states | **Complete, verified live** | Root-level handling was already good (`platform/src/components/state-panel.tsx`). Added `onboarding/loading.tsx`/`error.tsx` and `passport/loading.tsx`/`error.tsx`, both using `StatePanel`; `passport/page.tsx`'s bespoke "no profile yet" `<p>` replaced with a real `StatePanel`. Also fixed a real, live, pre-existing bug found incidentally while adding this: `app/error.tsx` destructured a `retry` prop that Next.js never passes (it passes `reset`) — the sitewide "Try again" button threw on every click. |
| S05-13 | Low-bandwidth/mobile | **Complete, verified live** | New `e2e/mobile-responsive.spec.ts` checks real horizontal overflow (`document.documentElement.scrollWidth` vs `window.innerWidth`) at a 360×740 viewport across login, signup, onboarding/basics and passport (own) — a genuine live signal code review alone can't give. This caught a real, previously-undetected bug: two native `<input type="date">` elements side by side in the new `WorkExperienceManager` (S05-05) each have a ~140px hard floor Chromium won't shrink below regardless of wrapper CSS; combined, they forced the *entire* authenticated app shell (every page using it, not just Passport) 24px wider than a 360px viewport. `min-w-0` alone (the first fix attempted) did not resolve it — confirmed by re-running the failing test unchanged — because `min-w-0` only relaxes the flex wrapper's own floor, not the native control's. Fixed by stacking the two date fields vertically below `sm` instead of forcing them side by side on narrow screens. Also hardened `avatar-upload.tsx`'s file-input wrapper with `min-w-0` as a preventative measure against the same class of issue. All 4 tests verified passing live against the real dev server and test Supabase project after the fix. |

## Founder decisions made

- **S05-10** (2026-09-14) — "job/service preferences" filters/
  prioritizes the talent's own opportunities feed rather than sitting
  as an inert settings page. See the decision log for the full record
  and the table row above for the implementation.

## Resolved during Phase B

**The portfolio/CV storage bucket was public** — every file a talent
uploaded (including anything used as a CV) was reachable by anyone with
the URL, whether or not their profile had been published or verified.
This predated this audit (migration `0018`) but was fixed as part of
the CV/portfolio work: migration `0065` made both `talent-portfolio`
and the new `talent-cv` bucket private, with signed URLs used
everywhere files are linked. Verified live (old-style public URLs now
return 400; signed URLs return 200).

## Phase B — completed

Every item below was built and verified live (staging Supabase project
and/or a real running dev server), no founder decision needed for any
of them — see the per-step table above for full detail on each:

- **S05-01** — real completed/current state in the onboarding step nav.
- **S05-02/S05-03/S05-08** — a real in-app "Edit" path from Passport
  back to `/onboarding/basics`.
- **S05-05** — work experience: new table + CRUD UI, P0.
- **S05-06** — a dedicated, private CV slot with signed URLs.
- **S05-07** — portfolio uploads moved to the same private bucket.
- **S05-09** — `rejection_reason` added to `talent_evidence` and
  surfaced, matching the introduction-video pattern.
- **S05-11** — an owner-preview mode on `/passport/[id]`.
- **S05-12** — `loading.tsx`/`error.tsx` for `onboarding/` and
  `passport/`, bespoke empty states replaced with `StatePanel`; also
  fixed an unrelated pre-existing bug in `app/error.tsx` found along
  the way (see the table row for detail).
- **S05-13** — a real Playwright mobile-viewport check, which caught
  and fixed a genuine pre-existing horizontal-overflow bug in the
  shared app shell (see the table row and decision log for detail).
- **S05-04** — education, once its scope turned out not to be
  genuinely ambiguous (same shape as work experience).
- **S05-10** — job-preference-driven default filtering on
  `/opportunities`, per your 2026-09-14 decision.
