# Stage 5 — Talent dashboard and passport

Status: **Phase B complete.** 11 of 13 tracker items are done and
verified live. The remaining two are deliberately deferred, not
forgotten: **S05-04** (education) and **S05-10** (job/service
preferences) both need a founder scoping conversation before any code,
since neither has an existing table/UI/infrastructure to extend and
guessing the shape risks building the wrong thing. S05-10 was
explicitly deferred per your decision (see the decision log). Every
other item — work experience, a private CV/portfolio bucket, evidence
rejection reasons, an owner-preview mode, consistent empty/loading/error
states, and a real mobile-overflow check — was built, verified against
the live staging Supabase project and/or a real running server, and is
described in detail in the table below.

## Phase A audit

| Step ID | What it means | Status | Evidence |
|---|---|---|---|
| S05-01 | Onboarding progress flow | **Mostly implemented** | `platform/src/app/onboarding/page.tsx:11-38` genuinely resumes at the right step (checks `talent_profiles.headline` + a `talent_evidence` identity row). Gap: the 3-step nav (`onboarding/layout.tsx`) renders as plain text, no visual completed/current state, no way to jump back except the browser button. |
| S05-02 | Personal/contact details | **Partial** | `saveBasics` (`platform/src/lib/actions/onboarding.ts:34-76`) validates and saves correctly; phone/email genuinely stay private (RLS `profiles_select`, `0002_rls.sql:94-95`, and the public view excludes them, `0034_public_talent_profile_safe_projection.sql:21-41`). Real gap: no in-app link anywhere reaches `/onboarding/basics` after the first pass — a talent can only edit these by guessing the URL. |
| S05-03 | Skills and service capabilities | **Partial** | `platform/src/components/skills-input.tsx` is a solid chip editor with real case-insensitive duplicate prevention. Same access gap as S05-02 (only reachable via `/onboarding/basics`), and no reordering exists. |
| S05-04 | Education and qualifications | **Missing** | Confirmed via repo-wide search: no table, column, or UI anywhere. P1. |
| S05-05 | Work experience | **Complete, verified live** | New `talent_work_experience` table (migration 0066) — employer, role title, date range, "currently working here" (expressed as a null end date, not a separate flag that could disagree with it), description, real reorder support. RLS mirrors `talent_portfolio_items`' shape exactly, including the update policy from day one (0018 shipped without one, needed 0056 to add it later — not repeating that gap). New `WorkExperienceManager` component; shown on both the owner's own Passport and the public/preview page, clearly labeled separately from the existing "Verified work history" (real completed contracts) so the two are never confused. Verified live: inserted a real row against staging, confirmed the date-order check constraint genuinely rejects a bad range, cleaned up. |
| S05-06 | CV upload and replacement | **Complete, verified live** | Real single-slot `cv_path` on `talent_profiles` (migration 0065), a dedicated `CvUpload` component with genuine replace-in-place semantics, backed by a new **private** `talent-cv` bucket. Verified live: uploaded a test PDF, confirmed the old-style public URL now returns 400 and a signed URL returns 200, then cleaned up. Signed URLs generated server-side (admin client) for the public/preview page, client-side (own session) for the owner's management view. |
| S05-07 | Portfolio and work samples | **Complete, privacy gap closed** | Full CRUD + reorder already existed (`portfolio-manager.tsx`). The `talent-portfolio` bucket is now **private** (migration 0065) — verified live the same way as S05-06 (public URL now 400, signed URL 200). File links in both the owner's management view and the public/preview page now use signed URLs instead of permanent public ones. |
| S05-08 | Availability, location, work preferences | **Partial** | Real scalar fields on `talent_profiles` (`location`, `work_mode`, `availability` — `0001_schema.sql:104-109`), same access gap as S05-02/03. |
| S05-09 | Verification status display | **Partial, inconsistent** | Passport shows the current tier prominently. But `talent_evidence` has **no rejection-reason column** — a rejected reference/credential shows no feedback, while the introduction video *does* show one (`introduction-video-manager.tsx:215-216`) and services show a status note. Inconsistent across features. Talent never sees their own tier-change history (`verification_events` is never queried from `platform/src`). |
| S05-10 | Job/service preference settings | **Missing — scope unclear** | No preferences table/column anywhere. Matching already runs directly off `talent_profiles.category`/`skills` from onboarding — there's no separate preferences layer, and no existing notification-preference infrastructure to hook a new setting into. What this should actually control isn't self-evident from the tracker wording alone. |
| S05-11 | Profile preview | **Missing** | `/passport/[id]` reads from `public_talent_profiles`, gated on `public_visible = true` — since a talent can't set that themselves (blocked by the 0008 self-escalation trigger), visiting their own passport before staff publish it just shows "This profile isn't available." No owner-bypass/preview mode exists. |
| S05-12 | Empty/loading/error states | **Inconsistent** | Root-level handling is genuinely good and reused via `platform/src/components/state-panel.tsx` (`app/error.tsx`, `dashboard/loading.tsx`, `talent-today.tsx`'s real query-driven empty states). But `onboarding/` and `passport/` have **no `loading.tsx`/`error.tsx` of their own** and don't use `StatePanel` at all — `passport/page.tsx`'s "no profile yet" state is a bespoke, inconsistent `<p>`. |
| S05-13 | Low-bandwidth/mobile | **Complete, verified live** | New `e2e/mobile-responsive.spec.ts` checks real horizontal overflow (`document.documentElement.scrollWidth` vs `window.innerWidth`) at a 360×740 viewport across login, signup, onboarding/basics and passport (own) — a genuine live signal code review alone can't give. This caught a real, previously-undetected bug: two native `<input type="date">` elements side by side in the new `WorkExperienceManager` (S05-05) each have a ~140px hard floor Chromium won't shrink below regardless of wrapper CSS; combined, they forced the *entire* authenticated app shell (every page using it, not just Passport) 24px wider than a 360px viewport. `min-w-0` alone (the first fix attempted) did not resolve it — confirmed by re-running the failing test unchanged — because `min-w-0` only relaxes the flex wrapper's own floor, not the native control's. Fixed by stacking the two date fields vertically below `sm` instead of forcing them side by side on narrow screens. Also hardened `avatar-upload.tsx`'s file-input wrapper with `min-w-0` as a preventative measure against the same class of issue. All 4 tests verified passing live against the real dev server and test Supabase project after the fix. |

## Needs a founder decision

- **S05-10** — what should "job/service preferences" actually mean and
  control here? There's no existing notification or discovery-ranking
  system for a preference to plug into yet — building something
  speculatively risks guessing wrong. Worth a scoping conversation
  before any code.

## Worth your attention regardless of Stage 5 priority

**The portfolio/CV storage bucket is public** — every file a talent
uploads (including anything used as a CV) is reachable by anyone with
the URL, whether or not their profile has been published or verified.
This predates this audit (migration `0018`, well before this session)
and isn't something Stage 5's tracker item asked about directly, but
it's a real privacy gap worth fixing as part of the CV/portfolio work
either way — flagging it explicitly rather than only mentioning it in
passing in the table above.

## Phase B — proposed bounded batch (starting once you've seen this)

No founder decision needed for these — standard engineering, most
following patterns already established elsewhere in this codebase:

- **S05-02/S05-03/S05-08** — add a real in-app "Edit" path from the
  passport page back to `/onboarding/basics` (the fields and validation
  already work; they're just unreachable).
- **S05-05** — build work experience as a new, standard entries table
  (employer, title, start/end dates or "current," description) + CRUD
  UI, mirroring the portfolio manager's established pattern. P0, and
  the field shape is conventional enough not to need a scoping
  conversation first — flagging the design here so you can course-correct
  if it's not what you had in mind.
- **S05-06** — a real, dedicated CV slot (single active file, genuine
  replace-in-place) instead of the generic-portfolio workaround, backed
  by a **private** bucket with signed URLs — this doubles as the
  storage-privacy fix above.
- **S05-07** — same private-bucket fix, applied to portfolio uploads too.
- **S05-09** — add `rejection_reason` to `talent_evidence` and surface
  it, matching the pattern already used for the introduction video and
  services.
- **S05-11** — an owner-preview mode on `/passport/[id]` so a talent
  can see their own not-yet-published profile.
- **S05-12** — add `loading.tsx`/`error.tsx` to `onboarding/` and
  `passport/`, and switch bespoke empty states to `StatePanel`.
- **S05-01** — small UX polish: show real completed/current state in
  the onboarding step nav.
- **S05-13** — verify real responsive behavior via Playwright at a
  narrow viewport across the key talent pages, since a live interactive
  browser isn't available here.

**S05-04** (education) stays out of this batch — P1, and given S05-10's
scope question already needs your input, better to ask about both
together than pile up a second guess about field shape without checking
first.
