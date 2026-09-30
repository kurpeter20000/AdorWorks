// The public marketing site (../, plain static HTML/CSS/JS) is a separate
// deployment/origin from this app (see README.md's "Architectural
// context") — there's no shared router to link back to it with, so the
// URL has to be configured. No custom domain is decided yet (README), so
// this falls back to the current live URL rather than requiring every
// environment to set the env var just to get a working link.
//
// Migrated off Netlify (backend/README.md / root README.md's Deploy
// section) after adorworks.netlify.app got paused for hitting Netlify's
// free-tier usage limits, breaking every "back to the website" /
// "Explore AdorWorks" link across this app in production — not a DNS or
// migration-routing issue, just Netlify's own limit page.
export const MARKETING_SITE_URL = process.env.NEXT_PUBLIC_MARKETING_SITE_URL || "https://adorworks.pages.dev";


// S13-12 — the platform app itself had no visible support/help contact
// anywhere (confirmed by grepping the whole app for mailto:/support@/
// contact.html — zero hits outside email-footer templates a user never
// sees in-app). The marketing site's contact.html already exists, works,
// and has a "Trust & Safety concern" topic option — reusing it here
// rather than building a second, separate in-app contact form.
export const CONTACT_URL = `${MARKETING_SITE_URL}/contact.html`;
