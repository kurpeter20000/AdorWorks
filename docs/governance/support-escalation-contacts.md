# Support scripts and escalation contacts (S15-13)

Who a pilot user, staff account, or an automated alert should actually
reach, and how fast a response is committed to. The founder is named as
the interim contact for every category below — there is no dedicated
support staff yet, and naming the person who is actually reachable
right now is more useful than a placeholder. **Email/phone left blank
deliberately** — fill in directly rather than have a personal address
committed to git history without asking first; a dedicated project
alias (e.g. `support@adorworks.<domain>` once a real domain exists, or
a free-tier forwarding address in the meantime) is worth considering
over a personal inbox, since this document's contact details are meant
to outlive any one person in the role.

## Safeguarding / PSEA reports

**Contact:** Founder — [add email/phone]
**Commitment:** Acknowledge within 24 hours, act within 72 hours (see
the 2026-09-28 decision-log entry). Every admin account can also see
these reports (`0084_safeguarding_reports.sql`'s deliberate fail-safe
default) — the founder is the *named* responsible party, not the only
one who can act if unreachable.
**Script:** On receiving a safeguarding report — read the full report
and any attached evidence before acting. Do not contact the reported
party directly if the report suggests any risk of retaliation or harm.
Suspend the reported account first if the report describes an ongoing
or imminent risk (`docs/governance/safeguarding-procedure.md` — draft,
pending legal review). Document every action taken in the report's own
resolution notes, not a side channel.

## Content reports (spam, scam, inappropriate, misleading, other)

**Contact:** Founder — [add email/phone]
**Commitment:** Acknowledge within 48 hours.
**Script:** Review via the staff console or `/operations` queue.
Resolve with a clear reason logged — every resolution requires one
(`reports` table's mandatory resolution-reason constraint).

## Organisation verification

**Contact:** Founder — [add email/phone]
**Commitment:** Reviewed within 5 business days of submission.

## Disputes (contract/payment)

**Contact:** Founder — [add email/phone]
**Commitment:** Initial response within 48 hours.

## Security incidents (suspected breach, credential compromise, active abuse)

**Contact:** Founder — [add email/phone]
**Commitment:** Immediate — this category doesn't wait for a queue.
**Script:** If a credential is confirmed or suspected compromised,
rotate it immediately (Supabase dashboard for DB/API keys, Vercel/
Render dashboards for platform secrets, GitHub Settings for repo
secrets) before investigating root cause. If production data exposure
is suspected, treat as a live incident, not a backlog item.

## Production infrastructure alerts (Sentry, uptime monitoring, backup failures)

**Contact:** Founder — [add email/phone]
**Commitment:** Same-day acknowledgement for anything affecting a live
user; backup-failure alerts (currently active — see the 2026-09-13
`backup-production-db.yml` failure, still unresolved as of 2026-09-27)
should not be left running red for more than a few days once noticed.

## What this document is not

Not a substitute for real support staff once the pilot grows past what
one person can reasonably keep up with — revisit these commitments
(and who holds them) as a real, explicit decision once that point is
reached, not by quietly missing the SLAs above.
