# Stage 1 — Product scope and team controls

Status: **Draft for founder review.** Nothing here is final until you approve it. Where I've written something as if it's already decided, it's because it's already true in the live product — I'm writing it down formally, not inventing something new. Where I'm genuinely unsure or where it's a real business/legal call, I've said so plainly instead of guessing.

---

## S01-01 — Freeze the MVP user types and primary journeys

**Proposed (reflects what's actually built today):**

- **Talent** — creates a profile ("Passport"), browses/applies to opportunities, receives offers, delivers contract work, gets paid (simulated), leaves/receives reviews.
- **Employer / organisation** — three account types exist in the database (`individual_client`, `org_member`, `org_admin`), all representing "the employer side." An organisation can have a team, not just one person.
- **AdorWorks staff** — four roles exist (`reviewer`, `matcher`, `finance`, `admin`) with different permissions — e.g. only finance/admin can touch money records.
- **Assisted users** — people onboarded with staff help (`onboarding_agent` role) rather than fully self-service, for people who need in-person/phone support to get started.

**Your call:** does this match what you intend for the pilot, or do you want to narrow it (e.g. exclude one employer sub-type, or defer assisted onboarding to a later stage)?

## S01-02 — Confirm South Sudan pilot geography and supported languages

**What I can confirm:** the product currently only exists in English, and mentions South Sudan and local payment providers (mGURUSH, MTN MoMo) in a few places, but there is no written list of which towns/regions the pilot targets or whether any other language is planned.

**This is genuinely your call, not mine** — I don't have a basis to guess at pilot geography or a language decision. Please tell me the answer and I'll record it here.

## S01-03 — Approve the MVP in-scope feature list

**Proposed, based on what's actually built and working today:**
Talent Passport & onboarding · opportunity search & applications · offers · contracts, milestones & deliverables · timesheets · disputes · simulated payments · two-sided reviews · employer organisation setup, team & verification · staff console (verification, moderation, shortlisting, finance records, disputes) · a newer staff opportunity-review screen inside the main app · notifications · a public marketing site with informational pages and six intake forms.

**Your call:** anything in that list you want explicitly OUT of the pilot?

## S01-04 — Approve the out-of-scope list

**Already informally documented, proposed to formalize as-is:**
- No real payment gateway — everything is simulated, `is_simulated` never becomes false anywhere in the code.
- No automated identity/KYC verification — a human staff member reviews submitted evidence.
- No native mobile app — a installable web app (PWA) instead.
- No real escrow (nothing here is licensed to hold client funds).

## S01-05 — Assign accountable owners to every stage

**Confirmed 2026-09-12 — no separate Engineer A / Engineer B yet.** It is just the Founder and Claude Code for now:
- **Founder (you)** — product scope, priorities, final approval on anything sensitive or costly.
- **Claude Code (me)** — does the Engineer A *and* Engineer B work described in the playbook (backend, database, auth, frontend, accessibility — all of it), plus implementation evidence and tests. Still cannot approve legal/security/payment/production sign-off — those stay blocked on a real person even if no such person is assigned yet.
- Legal counsel, security reviewer, pilot team — not yet identified; needed starting Stages 13, 14 and 16 respectively. These cannot be substituted by me.

If real engineers join later, ownership splits back out along the lines the playbook already describes, and any work I did in their area becomes something they review rather than build from scratch.

## S01-06 — Adopt one Definition of Done

**Already implemented.** The playbook you gave me already states a complete Definition of Done (see its "Definition of Done for one tracker step" section). Treating that as adopted unless you want changes to it.

## S01-07 — Protect the main branch and require review

**I cannot do this myself** — it needs GitHub repository admin access, which I don't have (no `gh` CLI, and an unauthenticated check confirmed I can't even read the current protection status). This has to be either done by you directly in GitHub (Settings → Branches → Add rule for `main`), or you'll need to grant access to whoever does it.

**Confirmed 2026-09-12 — you've authorized me to commit and push every change we make**, without asking per-commit, reserving your direct approval for anything sensitive or potentially costly (recorded in the decision log). Worth flagging honestly: until S01-07 is turned on, that means `main` really can be updated directly, by me, with no independent review catching a mistake before it's live. That's a real tradeoff for moving fast with just the two of us — turning on branch protection later would mean even your authorization would need to go through a pull request rather than a direct push. Let me know if you'd rather have that safety net sooner.

## S01-08 — Use one branch or worktree for each bounded task

**Partially true in practice, not yet a firm rule.** The worktree pattern (`adorworks-site`, `adorworks-backend`, `adorworks-platform`, `adorworks-fix`) already exists and works. Going forward, per the playbook, I'll open a dedicated task branch per bounded batch of step IDs rather than making mixed changes directly on `main` the way some earlier work in this project did before this playbook existed.

## S01-09 — Task template

Created: `docs/governance/task-template.md` (see that file).

## S01-10 — Decision log

Created: `docs/governance/decision-log.md`, backfilled with the real decisions already made in this project's history that I have direct evidence for.

## S01-11 — Inventory of existing features

See `docs/governance/stage-01-feature-inventory.md` — a stage-by-stage summary of what's already built, partially built, or not started, based on direct evidence from the codebase. This is an honest first pass, not a verified audit — actually confirming each item works correctly is exactly what Stages 2–16 exist to do.

## S01-12 — Prioritise the remaining backlog

Depends on S01-11 above and your review of it. My suggested starting priority, given what the inventory shows:

1. **Stage 4 (Authentication, permissions and privacy)** — the pilot cannot safely launch without this being solid, and a meaningful amount of the underlying security work is already done (row-level security, audit logging) but not verified against this tracker's specific acceptance criteria yet.
2. **Stage 3 (Data, backups and observability)** — no monitoring/alerting exists yet anywhere; this is a real operational risk the moment real users touch the pilot.
3. **Stage 2 (Environments, CI and test data)** — partially done (CI runs lint/test/build already) but no staging environment, no seed data, no disposable test database yet.

Stages 5–12 (the actual user-facing features) are, from what I can see, substantially further along than 2–4 in terms of raw feature-building — but they haven't been checked against this tracker's specific bar (accessibility, mobile testing, negative-path testing, audit coverage) yet, which is why I'd still sequence the foundational stages first per the playbook's own logic.

**Your call to confirm or reorder this.**
