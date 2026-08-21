# AdorWorks website

Plain static HTML/CSS/JS — no build step, no framework. Same architecture as
the Adormedia site (`../site/`), scoped to the **P0 "concierge launch"**
stage described in the AdorWorks Startup & Website Blueprint (Part 7):
a public site that explains AdorWorks, takes structured intake from talent
and employers via Netlify Forms, and gives the team something to review and
match by hand. It is **not** the full self-service marketplace (accounts,
dashboards, search, in-platform messaging, payments) — that's the P1/P2 work
described in the blueprint's `7.8 Functional requirements by release`, and
needs a backend this repo doesn't have.

This is a separate product from Adormedia and is meant to be deployed as its
**own** site — not merged into `../site/`'s Netlify deploy. `netlify.toml`
in this folder is set up for that (base directory `adorworks-site`, publish
`.`).

## What's here vs. what isn't

Built:
- Public marketing/info pages for the full sitemap in Blueprint §7.4.
- Netlify Forms for: employer brief, talent application, shortlist request,
  service request, general contact, insights-launch subscribe.
- The finalised AdorWorks brand (violet/teal/coral, Midnight, Manrope) —
  see `css/themes.css` and `img/`.
- Honest empty states instead of invented content: `jobs-projects.html` and
  `impact-stories.html` both say plainly that there's nothing to show yet,
  per the blueprint's evidence standards (§9.4) — no fake listings, no
  fabricated testimonials or stats.

Not built (deliberately out of scope for a static site):
- Talent/employer accounts, dashboards, saved searches, in-platform
  messaging, milestone tracking, payments — this is the P1/P2 marketplace
  build. `Appendices/AdorWorks_Startup_and_Website_Blueprint.pdf` (one
  level up, project root) is the brief for that build.
- Self-service talent search/filtering — `find-talent.html` collects a
  shortlist request instead, per the blueprint's explicit fallback
  ("If self-service search is not ready, show curated examples and a
  'Request a shortlist' form").
- Any real phone/WhatsApp number, privacy policy, terms of use or reporting
  channel — all marked `Content pending` inline (same convention as the
  Adormedia site) rather than filled with placeholder data. Fill these in
  once the actual details exist.

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
js/main.js               Nav toggle, analytics hooks, generic form submit
img/                      Logo SVGs (full-colour, reversed, mark, tagline)
404.html
robots.txt, sitemap.xml
netlify.toml
```

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
