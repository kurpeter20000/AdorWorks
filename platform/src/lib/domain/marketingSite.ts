// The public marketing site (../, plain static HTML/CSS/JS) is a separate
// deployment/origin from this app (see README.md's "Architectural
// context") — there's no shared router to link back to it with, so the
// URL has to be configured. No custom domain is decided yet (README), so
// this falls back to the current Netlify URL rather than requiring every
// environment to set the env var just to get a working link.
export const MARKETING_SITE_URL = process.env.NEXT_PUBLIC_MARKETING_SITE_URL || "https://adorworks.netlify.app";
