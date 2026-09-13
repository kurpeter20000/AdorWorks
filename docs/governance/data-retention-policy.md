# Data retention, deletion and export policy (S03-02, S04-10, S04-11)

**Founder decision, 2026-09-12**: keep data indefinitely for now; no
automatic expiry or anonymization job. Deletion is staff-assisted only —
if someone asks to be removed, AdorWorks staff handle it manually rather
than through a self-service "delete my account" feature. Revisit once
the pilot has real users actually asking for this, rather than building
a self-service flow speculatively before there's a real need.

**Founder decision, 2026-09-13 (S04-10, personal data export)**: same
approach — staff-assisted, not self-service. If someone asks for a copy
of their own data, a staff member pulls it directly (staff console or a
targeted database query) rather than through a "download my data"
button in the app. P1 priority and a small pilot made building a real
export feature speculative right now; revisit under the same triggers
as deletion below.

## What this means day to day

- No scheduled job deletes or anonymizes talent/employer data based on
  age or inactivity. (The only existing cron job expires stale
  *opportunity listings* — unrelated to personal data retention.)
- If a talent or employer asks to have their data removed, or asks for
  a copy of it, a staff member handles it directly against the database
  (Supabase dashboard or a targeted script written at the time, scoped
  to that one person) — there is currently no dedicated staff-console
  button for either. If either comes up often enough to be worth
  building a proper staff-console flow for, that's a new, separate
  piece of work, not covered by this decision.
- This is a deliberate, accepted gap against GDPR-style data-subject
  rights (no self-service export, no self-service deletion) —
  appropriate for a small, staff-mediated founding pilot in one country,
  not something to carry unexamined into a larger or different-market
  rollout later.

## What would trigger revisiting this

- A real deletion request comes in and staff-assisted handling turns out
  to be slow, error-prone, or burdensome.
- The pilot expands beyond South Sudan into a jurisdiction with a legal
  data-subject-rights requirement (the earlier language-support decision
  already flags Swahili/Arabic as expansion signals — deletion rights
  could follow the same trigger).
- Volume grows enough that "no retention limit" becomes a real storage
  or compliance cost, not just a theoretical one.
