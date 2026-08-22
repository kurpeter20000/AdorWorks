# AdorWorks website + backend

The public site is plain static HTML/CSS/JS — no build step, no framework —
now installable as a PWA (manifest + service worker) and tuned for
mobile-first use, since ~90% of the target market is on smartphones. The
backend (`backend/`) is Supabase (Postgres + Auth + Storage + Row Level
Security) plus a small Node/Express API for staff-only operations —
together they implement the full P1 self-service-marketplace data model
from the AdorWorks Startup & Website Blueprint §7.9, not just the P0
concierge stage the site content itself is still written for.

That's a deliberate split: the **content and public flows** (what a
visitor sees, the forms they fill in) are still concierge-stage — curated
shortlists, staff-reviewed verification, no self-service search or
accounts-facing UI yet — because the blueprint is explicit that trust and
process should be proven with a small pilot before opening up self-service.
The **data model underneath** is already the full thing, so growing into
self-service later is a frontend/UI project, not a database migration.

This is a separate product from Adormedia and is meant to be deployed as its
**own** site — not merged into `../site/`'s Netlify deploy. `netlify.toml`
in this folder is set up for that (base directory `adorworks-site`, publish
`.`).

## What's here vs. what isn't

Built:
- Public marketing/info pages for the full sitemap in Blueprint §7.4,
  installable as a PWA (`manifest.webmanifest`, `sw.js`, `offline.html`,
  an install-prompt banner) and audited for mobile touch targets, iOS
  safe-areas, and the sticky-header/anchor-scroll bug that's easy to miss
  (see `css/styles.css`'s `scroll-padding-top`).
- Six public forms (employer brief, talent application, shortlist
  request, service request, general contact, insights-launch subscribe)
  that submit to **Supabase** directly with the anon key once
  `js/supabase-config.js` is filled in (see `backend/supabase/README.md`),
  falling back to **Netlify Forms** automatically if it isn't — so the
  site works either way.
- The full backend schema + RLS (`backend/supabase/`) and a staff-console
  API (`backend/api/`) for verification, shortlisting, engagement
  tracking and manual finance records — see `backend/README.md`.
- The finalised AdorWorks brand (violet/teal/coral, Midnight, Manrope) —
  see `css/themes.css` and `img/`.
- Honest empty states instead of invented content: `jobs-projects.html` and
  `impact-stories.html` both say plainly that there's nothing to show yet,
  per the blueprint's evidence standards (§9.4) — no fake listings, no
  fabricated testimonials or stats.
- A staff console (`staff/`) for everything the API supports: triaging
  intake submissions and converting them into real accounts, verifying
  talent and organisations, building each opportunity's shortlist,
  creating engagements and tracking them through to completion with
  finance records, reviews and disputes. See `staff/README.md`.

Not built yet:
- **A talent/employer account UI** on the public site (login, dashboard,
  self-service search, in-platform messaging) — the backend supports all
  of this (see `backend/supabase/migrations`), but the public site's
  pages still only offer the concierge intake forms, per the blueprint's
  "prove the model before opening self-service" sequencing.
- A native mobile app — the PWA (installable from the browser, works
  offline for pages already visited) is the mobile-app answer for now;
  see `backend/README.md`'s note on when a native app would earn its cost.
- Any real phone/WhatsApp number, privacy policy, terms of use or reporting
  channel — all marked `Content pending` inline (same convention as the
  Adormedia site) rather than filled with placeholder data. Fill these in
  once the actual details exist.
- Real payments — `finance_records` in the backend is manual bookkeeping
  only; no payment gateway is integrated anywhere, per the blueprint's
  compliance-first rule pending a licensed local payment partner.

## Before this goes live

- **Working name.** The blueprint flags "AdorWorks" as a working name
  pending company-name, trademark, domain and social-handle clearance
  (see its "Document status and how to use it" section). That's noted in
  an HTML comment in `about.html` and in the footer copyright line on every
  page — remove both once clearance is confirmed.
- **Domain.** `robots.txt`, `sitemap.xml` and the JSON-LD on `index.html`
  assume `adorworks.com`. Update if the cleared domain differs.
- **Compliance.** Do not accept real client funds or run full-time/
  cross-border placements through this site before the recruitment-agency
  licensing, contracts, tax and payment-partner questions in Blueprint
  Part 5.8 and 11 are resolved with qualified counsel.
- **Contact details, policies.** Fill in the `Content pending` blocks on
  `contact.html` and `trust-safety.html` (WhatsApp/phone numbers, privacy
  policy, terms, reporting channel) once they're real and monitored.

## Deploy

1. Create a **new** Netlify site (don't reuse the Adormedia one) connected
   to the `kurpeter20000/AdorWorks` repo. Leave **base directory**, **build
   command** and **functions directory** all blank, and leave **publish
   directory** blank too (or `.`) — this repo's root is the site, there's
   no build step, and `netlify.toml` already declares `publish = "."`.
2. Netlify auto-detects the six forms in this repo's HTML
   (`data-netlify="true"`) at deploy time — no extra config.
3. In the Netlify dashboard → **Forms**, turn on email notifications for
   each form so submissions don't sit unseen — especially
   `adorworks-employer` and `adorworks-talent`, the two intake forms the
   whole concierge model depends on.

## Local preview

```
npx serve .
# or
python -m http.server 8080
```

## Structure

```
index.html            Home
find-talent.html       Find Talent (curated categories + shortlist request)
services.html          Services (packaged deliverables + service request)
jobs-projects.html     Jobs & Projects (honest "no listings yet" state)
for-employers.html     For Employers (hiring modes + employer brief form)
for-talent.html         For Talent (verification tiers + application form)
how-it-works.html      How It Works (both journeys, step by step)
trust-safety.html      Trust & Safety (verification, payments, disputes)
pricing.html            Pricing (fee model; talent side is always free)
impact-stories.html    Impact & Stories (case-study method, empty for now)
about.html              About (mission, Adormedia relationship, values)
insights.html            Insights (coming-soon + notify-me form)
contact.html             Contact (general enquiries)
css/themes.css          AdorWorks brand palette as CSS custom properties
css/styles.css          Shared layout, components, utilities
js/main.js               Nav toggle, analytics hooks, PWA install prompt, form submit
js/supabase-config.js    Public Supabase URL + anon key (fill in; not secret)
img/                      Logo SVGs + generated PWA icons (img/icons/)
manifest.webmanifest      PWA manifest
sw.js                     Service worker (offline shell caching)
offline.html              Shown when a page isn't cached and there's no connection
404.html
robots.txt, sitemap.xml
netlify.toml
backend/supabase/         Database schema, RLS policies, storage buckets (see backend/README.md)
backend/api/               Staff-console Node/Express API
staff/                     Staff console web UI (see staff/README.md) — noindex'd, login-gated
render.yaml                 Render Blueprint for deploying backend/api
```

## PWA / mobile

- **Install:** Chrome/Edge/Android show an in-page "Install AdorWorks"
  banner once the browser decides the site is installable (handled in
  `js/main.js`'s `beforeinstallprompt` listener). iOS Safari has no such
  event — install there is manual, via the Share sheet → "Add to Home
  Screen"; there's no code path to trigger it programmatically.
- **Offline:** `sw.js` precaches every page plus the CSS/JS/icon shell on
  first visit, so previously-viewed pages keep working with no
  connection; `offline.html` is the fallback for anything not cached.
  Form submissions are never intercepted by the service worker (only
  `GET` requests are) — no connection means no submission, by design,
  rather than a silently-queued write that might never actually send.
- **Bump `CACHE_VERSION` in `sw.js`** whenever you change a cached file
  (any CSS/JS/HTML in `SHELL_URLS`) — otherwise visitors with the site
  already installed keep serving the old cached copy indefinitely.
- **Regenerating icons:** `img/icons/*.png` were rasterized from
  `img/adorworks-mark.svg` (a one-off Node + `sharp` script, not checked
  in) — regenerate at the same sizes (192/512 "any", 192/512 "maskable"
  with ~52% icon-to-canvas ratio for safe-zone padding, 180 apple-touch)
  if the mark ever changes.

## Backend

Full setup instructions live in `backend/README.md`. Short version:

1. Create a Supabase project and run the four migrations in
   `backend/supabase/migrations/` (paste into the SQL Editor, in order).
2. Fill in `js/supabase-config.js` with your project's URL and anon key
   — the six public forms then write straight into `intake_submissions`.
3. `cd backend/api && npm install`, fill in `.env` from `.env.example`
   (this one needs the **secret** service_role key), `npm start` — this
   is what a future staff console would call to review submissions,
   verify people/organisations, build shortlists and track engagements.

## Brand

Single palette (no per-page theme switching, unlike the Adormedia site):
Midnight `#182230` (primary/text), Opportunity Teal `#00A88F` (primary
action colour), Talent Violet `#5B4BDB` (secondary accent), Energy Coral
`#FF6B4A` (sparing highlight only), Cloud `#F4F7FB` (background), Slate
`#596274` (muted text). Headings and the wordmark use Manrope (loaded from
Google Fonts), matching the delivered logo files in `img/`.

## Analytics

`js/main.js` pushes events to `window.dataLayer` for: WhatsApp/phone clicks,
downloads, and every form submission (event name `adorworks_event`, action
`form_submit` with a `form_id`). Wire up GTM/GA4 the same way as the
Adormedia site — see `../site/README.md`.
