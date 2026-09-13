# Stage 5 — Talent dashboard and passport

Status: **Phase A audit complete.** Much of this is already solid
(portfolio CRUD, RLS-backed privacy, matching off real profile data),
but two real gaps stand out: two entire features (work experience,
education) don't exist yet despite work experience being P0, and
portfolio/CV files sit in a **public** storage bucket regardless of
whether a profile is published — worth your attention before Phase B
starts.

## Phase A audit

| Step ID | What it means | Status | Evidence |
|---|---|---|---|
| S05-01 | Onboarding progress flow | **Mostly implemented** | `platform/src/app/onboarding/page.tsx:11-38` genuinely resumes at the right step (checks `talent_profiles.headline` + a `talent_evidence` identity row). Gap: the 3-step nav (`onboarding/layout.tsx`) renders as plain text, no visual completed/current state, no way to jump back except the browser button. |
| S05-02 | Personal/contact details | **Partial** | `saveBasics` (`platform/src/lib/actions/onboarding.ts:34-76`) validates and saves correctly; phone/email genuinely stay private (RLS `profiles_select`, `0002_rls.sql:94-95`, and the public view excludes them, `0034_public_talent_profile_safe_projection.sql:21-41`). Real gap: no in-app link anywhere reaches `/onboarding/basics` after the first pass — a talent can only edit these by guessing the URL. |
| S05-03 | Skills and service capabilities | **Partial** | `platform/src/components/skills-input.tsx` is a solid chip editor with real case-insensitive duplicate prevention. Same access gap as S05-02 (only reachable via `/onboarding/basics`), and no reordering exists. |
| S05-04 | Education and qualifications | **Missing** | Confirmed via repo-wide search: no table, column, or UI anywhere. P1. |
| S05-05 | Work experience | **Missing** | No work-history table, no date-range fields, no "currently working here" flag anywhere. The only proxy, `talent_profiles.years_experience`, isn't even set by any current form. **This is P0 and entirely absent** — the most significant gap in this stage. |
| S05-06 | CV upload and replacement | **Not a dedicated feature — and a real privacy gap** | No `cv_path`/resume field exists. A talent can only upload a PDF as a generic **portfolio** item (`platform/src/app/passport/portfolio-manager.tsx`), with placeholder text literally suggesting "e.g. your CV." No replace-in-place — a new upload is just another list item. The storage bucket (`talent-portfolio`) is **public** (`0018_passport_portfolio_and_links.sql:60-61`) — a "CV" uploaded this way is fetchable by anyone with the URL, regardless of profile publish state. |
| S05-07 | Portfolio and work samples | **Mostly complete — shares S05-06's privacy gap** | Full CRUD + reorder with proper re-sequencing (`portfolio-manager.tsx`). Row-level visibility is RLS-gated correctly, but the underlying storage bucket being public means the actual files are reachable by direct URL regardless of what the database row says. |
| S05-08 | Availability, location, work preferences | **Partial** | Real scalar fields on `talent_profiles` (`location`, `work_mode`, `availability` — `0001_schema.sql:104-109`), same access gap as S05-02/03. |
| S05-09 | Verification status display | **Partial, inconsistent** | Passport shows the current tier prominently. But `talent_evidence` has **no rejection-reason column** — a rejected reference/credential shows no feedback, while the introduction video *does* show one (`introduction-video-manager.tsx:215-216`) and services show a status note. Inconsistent across features. Talent never sees their own tier-change history (`verification_events` is never queried from `platform/src`). |
| S05-10 | Job/service preference settings | **Missing — scope unclear** | No preferences table/column anywhere. Matching already runs directly off `talent_profiles.category`/`skills` from onboarding — there's no separate preferences layer, and no existing notification-preference infrastructure to hook a new setting into. What this should actually control isn't self-evident from the tracker wording alone. |
| S05-11 | Profile preview | **Missing** | `/passport/[id]` reads from `public_talent_profiles`, gated on `public_visible = true` — since a talent can't set that themselves (blocked by the 0008 self-escalation trigger), visiting their own passport before staff publish it just shows "This profile isn't available." No owner-bypass/preview mode exists. |
| S05-12 | Empty/loading/error states | **Inconsistent** | Root-level handling is genuinely good and reused via `platform/src/components/state-panel.tsx` (`app/error.tsx`, `dashboard/loading.tsx`, `talent-today.tsx`'s real query-driven empty states). But `onboarding/` and `passport/` have **no `loading.tsx`/`error.tsx` of their own** and don't use `StatePanel` at all — `passport/page.tsx`'s "no profile yet" state is a bespoke, inconsistent `<p>`. |
| S05-13 | Low-bandwidth/mobile | **Partial, can't fully verify from code** | Responsive Tailwind classes used throughout (`basics-form.tsx`, `passport/page.tsx`). Avatar upload is properly optimized (`next/image`, explicit `sizes`); portfolio file links are plain, unoptimized `<a>` tags. A global `ConnectivityBanner` (`components/connectivity-banner.tsx`) shows an offline state app-wide. Live breakpoint/throttled-network testing needs an actual browser, not just code review — planned via Playwright at a narrow viewport as the closest available substitute. |

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
