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

// The full staff console (people/talent/organisations/opportunities/
// engagements/contracts, including disputes and finance oversight this
// app's own /operations doesn't cover yet) is a separate static app
// deployed alongside the marketing site, not a route in this Next.js
// app — see staff/README.md. It shares the same Supabase project, so a
// staff account's session isn't transferred automatically, but the
// login form there uses the same email/password.
export const STAFF_CONSOLE_URL = `${MARKETING_SITE_URL}/staff/login`;
