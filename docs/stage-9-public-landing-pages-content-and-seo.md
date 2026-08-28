# Stage 9 — Public Landing Pages, Content and SEO

Status: **implemented, gap-checked and corrected, verified against the
literal approval gate** (commits `973722a`, `53b19c1`, `b60ce63`). This
stage worked against an existing, already-largely-honest static public
site at the repo root (12 pages, predating the staged process) rather
than building marketing pages from scratch — the pre-work audit found
most of the copy already reflected real product capability (verification
tiers, escrow disclaimers, "content pending" placeholders instead of
fabricated stats/testimonials). Two direct product decisions: production
domain (`adorworks.netlify.app`, the real live domain — "AdorWorks" is
still pending trademark/domain clearance, so the site's placeholder
`adorworks.com` wasn't real) and analytics provider (Google Analytics 4,
consent-gated).

## What this delivered

- **A real security gap found and fixed**: `netlify.toml`'s `publish = "."`
  served this repo's *entire* git-tracked tree as static files, not just
  the 12 marketing pages — `backend/` (Express source), `platform/` (the
  Next.js app's own source, already deployed separately by Vercel),
  `docs/` (every one of this project's internal stage write-ups,
  including documented known gaps) and `.github/` were all directly
  fetchable, e.g. `adorworks.netlify.app/docs/stage-7-....md`. No secrets
  leaked (`.env*` is gitignored, never reaches the deploy), but source
  code and internal reasoning did. Fixed with `force = true` redirect
  rules turning each path into a real 404 — required because a
  non-forced redirect never fires for a URL that matches a real file.
- **`/staff/*` hardened against indexing** — the existing per-page
  `noindex` meta tag only stops a crawler that renders the page; added
  `X-Robots-Tag: noindex, nofollow` as a response header, which applies
  even to a bot that only reads headers.
- **Canonical, Open Graph and Twitter Card tags on all 12 public pages**
  — previously only the homepage had any OG tags, and no page anywhere
  had a canonical tag or a Twitter Card. Fixed the homepage's og:image
  from a relative SVG (poor social-scraper support) to an absolute
  raster URL, reused across all pages.
- **Domain corrected everywhere** — robots.txt, sitemap.xml (with
  refreshed `lastmod` dates) and the homepage's Organization JSON-LD all
  switched from the placeholder `adorworks.com` to the real live
  `adorworks.netlify.app`.
- **pricing.html corrected for truthfulness** — its fee table stated
  specific nonzero rates (8–12%, 15–25%, etc.) as a "starting model"
  without making clear these aren't actually charged. The platform's
  real fee today is 0% (Stage 7's approved decision). Added an explicit
  "0% today" notice in three places (hero lede, a highlighted notice box,
  and a table footnote) and reframed the table itself as a model being
  validated for later, not live pricing.
- **Consent-gated Google Analytics 4** (`js/analytics.js` +
  `js/analytics-config.js`) — Google Consent Mode defaults to fully
  denied on every page load; a cookie banner (keyboard-accessible,
  focus-neutral between Accept/Decline) asks before anything loads;
  `gtag.js` itself is only fetched after explicit consent *and* a
  configured Measurement ID (left blank by default — same "no ID, no
  live calls" pattern as the payment-provider and email scaffolding in
  `platform/`). Bridges `main.js`'s existing
  `dataLayer.push({event:"adorworks_event",...})` calls into real
  `gtag('event', ...)` calls once active, re-installed after `gtag.js`
  loads so the bridge survives Google's own dataLayer takeover (a real
  bug the gap-check caught — see below).
- **Service worker updated** to precache the two new JS files and bumped
  `CACHE_VERSION` so installed/offline copies pick up everything above.

## Gap-check findings and fixes (all corrected in `b60ce63`)

An independent review against this stage's exact six-item approval gate
found two real issues, both in the analytics implementation:

1. **The dataLayer→GA4 bridge would silently stop working once real
   `gtag.js` loaded.** Google's script reinstalls its own `dataLayer.push`
   to process the command queue, which would clobber the one-shot
   wrapper bridging `main.js`'s custom event shape into `gtag('event',
   ...)` — any event fired afterward would stop reaching GA4 with no
   visible error. Fixed by re-installing the bridge in the script's
   `load` handler so it survives Google's own initialization.
2. **The consent banner auto-focused "Accept" specifically** — a mild
   nudge-toward-acceptance default inconsistent with the platform's own
   trust/fairness positioning. Now focuses the banner region itself,
   leaving both choices equally reachable.

## Approval gate — verified

- every public claim matches working product capability — **pass**
  (pricing.html corrected; all other pages were already honest per the
  pre-work content audit)
- each call to action reaches the correct real journey — **pass**
  (login CTAs → real platform login; lead-capture forms → `intake_submissions`
  via direct Supabase REST call, a genuine assisted-onboarding intake
  path, not a dead end)
- no private data is exposed or indexed — **pass** (the `publish = "."`
  exposure fix; `/staff/*` noindex header; confirmed no `.env` files
  reach the deploy)
- metadata, canonical, sitemap, robots and redirects are correct —
  **pass** (verified well-formed, domain-consistent, no ordering
  conflicts in the redirect rules)
- pages meet responsive, accessibility and performance budgets — **pass**
  (one `<h1>` and zero missing `alt` attributes across all 12 pages;
  banner is keyboard-operable and never blocks content)
- analytics respects consent and policy requirements — **pass** (nothing
  contacts Google before explicit consent; Consent Mode defaults denied;
  fixed the bridge survival issue above)

## Deliberate, honest scope choices (not gaps — decisions)

- **No custom social-card image was designed.** The OG/Twitter image
  reuses the existing 512×512 PWA icon (a real, correctly-sized-enough
  raster asset) rather than a purpose-built 1200×630 banner, which this
  environment has no way to design. A proper social card is a worthwhile
  follow-up, not a blocker.
- **No CTA anywhere links directly into the platform's self-service
  signup** — every acquisition path on the public site goes through
  either the real platform login (existing users) or the Netlify-Forms
  → `intake_submissions` lead-capture path (new interest, staff-reviewed
  assisted onboarding). This predates Stage 9 and reads as a deliberate
  curation choice for a pre-launch platform building trust before opening
  pure self-service signup to public traffic, not a broken funnel — noted
  for awareness, not changed.
- **`platform/src/lib/email.ts` still defaults its "from" address to
  `notifications@adorworks.com`** — the same placeholder-domain problem
  fixed everywhere on the public site, but that file is Stage 7's
  territory (email sending config), not the public site Stage 9 scoped
  to. Flagged here as a cross-cutting follow-up, not fixed in this pass.

## Migrations added

None — this stage touched only the static public site (HTML/CSS/JS/
config), no database schema changes.

## Tests

No automated test suite covers this static site (confirmed via
`.github/workflows/ci.yml`, which only runs `platform/` and
`backend/api/`). Verification here was: JS syntax checks (`node --check`)
on all new/modified files, JSON-LD/TOML/sitemap-XML well-formedness
checks, and a full-site grep sweep for accessibility basics (`<h1>`
count, missing `alt`) and leftover placeholder-domain references.

## Known gap

Analytics is fully scaffolded but inert until a real GA4 Measurement ID
is created and set in `js/analytics-config.js` — see the README's
"Analytics" section for the exact steps. The Netlify plan's billing
limit (noted separately, as of 2026-08-22) may still be blocking
production deploys of this and future pushes; confirm that's cleared
before expecting any of this to be visible on `adorworks.netlify.app`.
