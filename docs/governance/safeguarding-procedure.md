# Safeguarding and PSEA (Protection from Sexual Exploitation and Abuse) procedure (S13-14, draft)

**Status: draft, pending founder/Legal Counsel approval.** This document
is written to close the specific gap `stage-01-feature-inventory.md`
already flagged ("safeguarding/PSEA-specific escalation handling not
confirmed as a distinct feature") and that the S10-10 migration's own
comment admitted directly: the structural routing exists, but *who* the
ultimately-responsible named contact is was explicitly left as "a
founder policy call not yet made." This draft proposes the safest
available default (documented below) rather than leaving the question
open indefinitely — the founder or Legal Counsel should confirm, amend,
or replace it, not treat it as already decided.

## What already exists (built, not proposed)

- `reports.reason` includes a distinct `'safeguarding'` category
  (`backend/supabase/migrations/0084_safeguarding_reports.sql`).
- A report filed with that reason is visible and actionable **only** by
  `is_admin()` staff — enforced at the RLS layer, not just hidden in the
  staff console's UI. A reviewer, matcher, or finance-role staff account
  cannot see it at all, confirmed live (Stage 10 verification).
- The in-app reporting UI (`report-button.tsx`) offers "Safety concern —
  exploitation, abuse, or harassment" as a selectable reason on any
  listing or profile.
- `risk_flags` (`backend/supabase/migrations/0083_risk_flags.sql`) gives
  staff a second, proactive channel — any staff role can flag a
  suspicious organisation, opportunity, talent profile, service, or file
  for review, distinct from a user-submitted report.

## What this document proposes (needs approval)

### Who receives a safeguarding report

**Proposed default: every admin-role staff account.** Not a single named
individual — the RLS policy already scopes visibility to `is_admin()`,
which today means every account with `profiles.role = 'admin'`. Every
admin account already goes through the maker-checker promotion process
(`0036_role_change_requests.sql`, Stage 2) and mandatory MFA (S04-08), so
this isn't an unvetted or casual group.

**Open question for the founder:** should this narrow to a smaller,
specifically-named group (e.g. one designated safeguarding lead, or two
people for redundancy) rather than "every admin"? "Every admin" is the
safest structural default available without inventing a specific
person — it fails toward more eyes on a sensitive report, not fewer —
but a small pilot team may prefer a named individual. If so, that's a
follow-up migration narrowing the RLS policy once the founder names who.

### Confidentiality

- A safeguarding report's content (the reporter's identity, the target,
  and the report text) is visible only to admin-role staff, enforced at
  the database layer as described above — not just a UI convention.
- Staff should not discuss the specifics of an open safeguarding report
  outside the admin group handling it, including with the reported
  party, until/unless the response process below reaches a point where
  disclosure is necessary (e.g. put to the reported party as part of an
  enforcement action).
- The reporting user is not automatically notified of the outcome in
  detail — see "Response to the reporter" below.

### Response

**Proposed target: acknowledge receipt and begin review within 2
business days.** This is a proposed operational target, not something
measured or enforced by any code today (S10-12's own tracker item — SLA
targets for staff queues generally — is still unbuilt; a safeguarding
report currently has no reminder or escalation timer). If approved, an
actual reminder/escalation mechanism would be a real follow-up build,
not assumed to already exist.

Initial triage should determine:

1. Is there an immediate safety risk (ongoing contact, a minor
   involved, an in-progress transaction)? If so, escalate immediately
   rather than following the standard queue order.
2. Does this need reporting to an external authority (law enforcement,
   a partner organisation's own safeguarding process)? `terms.html`
   and `community-standards.html` already reserve AdorWorks' right to
   refer serious matters to authorities (§8 of Community Standards) —
   this document doesn't create new legal reporting obligations, it
   assumes whatever South Sudan's actual legal requirements are will be
   confirmed under S13-01/S13-02 and layered on top of this internal
   process.
3. What enforcement action, if any, is appropriate against the reported
   account — up to and including suspension (already built, S10-08) —
   using the same evidence/proportionality approach Community Standards
   §8 already documents for general enforcement.

### Response to the reporter

**Proposed: a brief acknowledgement that the report was received and is
being handled, without necessarily disclosing the outcome or any action
taken against the other party** (standard practice for safety reports
generally — the reported party's own outcome isn't automatically owed to
the reporter). Today, `report-button.tsx` shows only "Report submitted —
thank you" with no further contact channel — see
`docs/governance/third-party-vendors.md`'s companion finding that the
in-app report flow surfaces no follow-up contact information at all.
Closing that (a visible "we'll follow up if we need more information, or
contact [X] directly for anything urgent" message) is a small, concrete
follow-up build once a real contact channel exists to point to — see
next section.

### The published contact channel

`trust-safety.html` currently states, verbatim: *"A dedicated reporting
channel (email address and/or form) will be published here once staffed
and monitored — we won't publish a channel we can't yet respond to
reliably."* That's a deliberate, already-made decision, not an
oversight — this document does not override it. Publishing a safeguarding-
specific contact channel is a founder decision gated on having someone
who will actually monitor it, not an engineering task to complete
unilaterally.

## What would trigger revisiting this

- The founder confirms or changes who receives a report (see "who
  receives a safeguarding report" above).
- Legal Counsel's review (S13-01/S13-14's formal approval) adds a
  requirement not covered above — e.g. a specific external reporting
  obligation under South Sudan law.
- A dedicated safeguarding contact channel is ready to publish (staffed
  and monitored), at which point `trust-safety.html`'s "pending" notice
  should be replaced with the real channel, and `report-button.tsx`'s
  post-submission message should be updated to reference it.
- The pilot's first real safeguarding report — whatever this document
  gets wrong in the abstract will become obvious the first time it's
  used for real.
