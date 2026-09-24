# Data retention, deletion and export policy (S03-02, S04-10, S04-11, S13-10)

**Founder decision, 2026-09-12**: keep data indefinitely for now; no
automatic expiry or anonymization job. Deletion is staff-assisted only —
if someone asks to be removed, AdorWorks staff handle it manually rather
than through a self-service "delete my account" feature. Revisit once
the pilot has real users actually asking for this, rather than building
a self-service flow speculatively before there's a real need.

## Retention schedule by category (S13-10)

The founder's "keep indefinitely, staff-assisted deletion" decision
above is the retention rule for every category below except backups,
which have a real technical limit already in place. This section exists
so "what's our retention schedule" has one answer covering all five
record types the tracker's own acceptance criteria names, rather than
requiring someone to infer it from the general policy above. **This is a
retention *schedule* (what's kept, for how long, where), not a legal
sign-off** — S13-10's formal approval is Legal Counsel's to give; this
document is what would be put in front of them for that review.

| Category | Retention | Where it lives | Deletion path |
|---|---|---|---|
| User records (profiles, talent/org details, contact info) | Indefinite (no automatic expiry) | Supabase Postgres (`profiles`, `talent_profiles`, `organisations`, etc.) | Staff-assisted only, per the decision above |
| Applications (job applications, service requests, offers) | Indefinite — these are the record of what actually happened on the platform (who applied to what, when, what was offered), not just standalone personal data | Supabase Postgres (`applications`, `service_requests`, `offers`, `contracts`) | Staff-assisted only; deleting a user's profile does not need to cascade-delete their application history, since the other party to that application/contract has a legitimate record-keeping interest in it too |
| Files (portfolio items, CVs, verification/evidence documents, intro videos, org logos) | Indefinite, tied to the owning record | Supabase Storage (private buckets — `talent-portfolio`, verification/evidence buckets, `org-logos`, etc.) | Staff-assisted only, same as the owning record — no separate file-expiry job exists |
| Logs (`audit_events`, `engagement_events`, and the other purpose-built audit tables) | Indefinite — this is the accountability trail for sensitive staff/system actions (Stage 10's S10-14 work), and the whole point of an audit log is that it doesn't get quietly deleted | Supabase Postgres | Not deleted in the ordinary course; would only be touched as part of a full account deletion, staff-assisted, same as above |
| Backups (daily production database dumps) | **30 days**, not indefinite — this is a real, already-implemented technical limit (GitHub Actions artifact expiry), not a policy choice made here | GitHub Actions workflow artifacts (`.github/workflows/backup-production-db.yml`) | Automatic expiry after 30 days; no manual deletion path exists or is needed. Full detail: `docs/governance/backups-and-restore.md`, which this document intentionally does not duplicate |

A deletion request therefore has to be handled in two places, not one:
the live database/storage record (staff-assisted, per the general
decision above) and — for up to 30 days afterward — that person's data
may still exist in a backup artifact, since restoring a backup to purge
one person's data from it isn't practical for a pilot at this scale. If
this gap ever matters in practice (a deletion request during an active
legal/compliance review, for instance), it needs its own handling — not
something this document works around by promising a capability that
doesn't exist yet.

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
