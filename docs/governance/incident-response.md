# Incident response and escalation (S03-11)

## Trigger conditions

Reused directly from the internal security review
(`docs/stage-10-security-accessibility-performance-and-controlled-release.md`
§8), since these already cover the highest-stakes failure modes for this
platform:

- A signed-in user of any role cannot reach their dashboard.
- Any error surfaces during sign-up, login, or opportunity/application
  submission for more than a handful of users.
- Any payment-related action behaves unexpectedly (the entire checkout
  flow is real and used today, even though it's simulated end-to-end —
  `REAL_PAYMENTS` is off).
- Any RLS-related error appears in reports (would indicate a security
  fix or something adjacent to it regressed).
- **[Once S03-06/S03-07 monitoring is live]**: an error-rate or downtime
  alert fires.

## Who to contact — TO BE FILLED IN

There's currently just the founder and Claude Code on this project
(`decision-log.md`, 2026-09-12), so today's real answer is "the founder
notices or is told, and handles it directly or asks Claude Code to." As
the team grows, replace this section with a real chain:

- **Primary on-call**: _[name / phone / how they're reached]_
- **Backup**: _[name / phone]_
- **Who has production access** (Vercel, Render, Supabase, GitHub):
  _[list]_
- **Escalation path if primary is unreachable**: _[e.g. call backup after
  N minutes]_

## Response steps

1. **Confirm it's real** — reproduce it, or get a second report. Check
   the structured request logs (`backend/api`, S03-08 — every request
   logs a `requestId`, `status`, `durationMs`; a spike in 5xx status
   lines is the fastest signal available today without external
   monitoring).
2. **Decide: rollback, or fix forward?** Use the trigger conditions
   above. Rolling back is almost always faster and lower-risk than a
   rushed fix — see the rollback procedure
   (`docs/governance/stage-03-data-backups-observability.md`'s S03-12
   entry, and the detailed steps in
   `docs/stage-10-...md` §8).
3. **Communicate** — tell affected users if the incident is visible to
   them (e.g. can't log in). At pilot scale with a small, staff-mediated
   user base, this is realistically a direct message/call, not a status
   page.
4. **Fix and verify live** — same standard as everything else in this
   project: don't declare it resolved until it's actually been checked
   against the real, deployed system, not just "the code looks right
   now."
5. **Write it down** — add an entry to `docs/governance/decision-log.md`
   (what happened, what triggered it, what fixed it) so the same failure
   mode is recognizable faster next time.

## Still open

- The contact chain above is a placeholder — needs the founder to fill
  in real names/contacts once there's more than one person to route to.
- No alerting exists yet to *detect* an incident automatically (S03-06,
  S03-07 — founder decided to proceed with Sentry + UptimeRobot,
  2026-09-12; setup is a separate follow-up once accounts exist).
