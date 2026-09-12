# Product and architecture decision log (S01-10)

Add a new entry for every important decision. Keep entries even if a later decision reverses them — the history matters.

---

**2026-09-12 — No separate Engineer A / Engineer B for now; Claude Code covers both roles**
Owner: Founder. Reason: no other engineers are on the project yet. Impact: until real engineers join, I (Claude Code) do the work the playbook assigns to both Engineer A and Engineer B, under the founder's review — legal counsel, security reviewer and pilot team roles remain unfilled and genuinely blocked, since the playbook is explicit those cannot be substituted.

**2026-09-12 — Standing authorization to commit and push every change**
Owner: Founder. Reason: the founder doesn't code and wants me to build directly rather than asking for commit-by-commit permission for routine work. Impact: I commit and push without asking each time; the founder's direct approval is reserved for anything sensitive or potentially costly (security, legal, payments, production-affecting, or otherwise high-stakes), which I still flag and wait on. `main` currently has no branch protection (S01-07 still open), so this relies on care rather than a safety net catching mistakes before they're live — noted as an accepted tradeoff for now.

**2026-09-12 — Adopted the Claude Code Development Playbook as the governance process**
Owner: Founder. Reason: prior work in this project happened ad hoc across several parallel sessions without a shared process, stage sequencing, or a single tracker of what's actually done vs. assumed done. Impact: all further work follows the playbook's stage/step-ID/Definition-of-Done model; the Excel tracker is now the source of truth for scope and status.

**2026-09-11 — Migrated the public marketing site from Netlify to Cloudflare Pages**
Owner: Founder + Claude Code. Reason: `adorworks.netlify.app` was paused by Netlify itself for hitting free-tier usage limits, breaking every "back to the website" link from the platform app in production. Impact: canonical/OG/sitemap references, and every link inside the platform app, now point at `adorworks.pages.dev`. A real build step (`build-cf-pages.mjs`) was added — a first for this repo, which previously had no build step for the static site — because relying on `_redirects` alone to block `/backend/`, `/platform/`, `/docs/`, `/.github/` from being publicly servable turned out not to work (Cloudflare Pages' `_redirects` silently rejects a `404` status code, confirmed from the actual deploy log after an earlier, wrong diagnosis blamed a different cause).

**2026-09-11 — Kept Cloudflare Pages rather than switching to Workers Static Assets**
Owner: Claude Code, with founder's directional question. Reason: Cloudflare is steering new projects toward Workers Static Assets, but it has no documented mechanism to exclude specific files/directories from deployment, and its `_redirects` explicitly does not override a real uploaded file — the opposite of what this site needs to keep `backend/`/`platform/`/`docs/` from being publicly exposed. Pages' behavior does. Impact: this project's static site stays on Pages; revisit only if the site itself needs real server-side/edge logic later.

**2026-09-11 — Closed several audit-logging gaps in the backend API**
Owner: Claude Code (backend session). Reason: a prior internal security review (`docs/stage-10-...md`, defect #5, High severity) found dispute resolution, refund issuance, manual finance-record changes, opportunity moderation, and onboarding-agent role grants were never audit-logged, despite the event names already existing in the shared vocabulary (`platform/src/lib/domain/events.ts`) — the wiring was just never done. Impact: those five actions now write to `audit_events`; corresponding new event-name constants were added to keep the platform and backend vocabularies in sync.

**2026-09-10 — Redesigned the platform app's shell: persistent sidebar + mode switcher**
Owner: Founder + Claude Code. Reason: the previous top-nav-only layout didn't scale to a growing route list, and there was no clean way for a user to move between "using the app" and "browsing the public site," or (for talent) between full-time and freelance/contract work-type filtering. Impact: `platform/` now has a left sidebar (desktop) / drawer (mobile) and a top-bar mode switcher (Explore Mode / Client Mode / Talent Mode with Full-time / Freelancing & Contract sub-filters). Superseded the old `top-nav.tsx`/`top-nav-client.tsx` components entirely.

**2026-09-09 — Redesigned the login/signup pages with a full-bleed hero video background**
Owner: Founder + Claude Code. Reason: the original login page was judged too plain and too narrow for a laptop-width screen. Impact: reused the marketing site's existing hero video (no new asset sourced), added an "Explore AdorWorks" affordance consistent with the later mode-switcher naming, and widened the card for larger screens.
