# Third-party vendors and data roles (S13-11)

Every external service AdorWorks currently sends real or potential user
data to, in one place, with what each one actually touches. Built for
the founder's own review and as the starting point for whatever data
processing agreements or privacy-policy disclosures Legal Counsel
decides are needed (S13-01–S13-14) — this document doesn't itself
constitute legal review, it's what gets put in front of that review.

Consolidated from what's already integrated (env files, `README.md`,
`render.yaml`, and the governance docs listed under each vendor below) —
nothing here is a new vendor decision, just the first time they're all
listed together with their data role stated explicitly.

| Vendor | Role | Data it touches | Where it's configured |
|---|---|---|---|
| **Supabase** | Database, authentication, file storage, row-level security | Everything — every user record, every message, every uploaded file, every login credential. The one vendor with the broadest data access by far. | `platform/.env.local.example`, `backend/api/.env.example`, `render.yaml` |
| **Vercel** | Hosts the platform app (`ador-works.vercel.app`) | All in-app HTTP traffic and session cookies pass through it; no persistent storage of its own | `platform/README.md` |
| **Render** | Hosts `backend/api`, the staff console's API | Holds the Supabase service-role key (`SUPABASE_SERVICE_ROLE_KEY`) — full, RLS-bypassing database access, same breadth as Supabase itself while a request is in flight | `render.yaml` |
| **Cloudflare Pages** | Hosts the public marketing site (`adorworks.pages.dev`) | Static content only; receives marketing-site contact-form submissions in transit | `README.md` |
| **Brevo** | Transactional email (account notifications, password resets, activity emails) | Recipient email addresses and email content; same account already used as Supabase Auth's custom SMTP provider | `platform/.env.local.example` |
| **Africa's Talking** | Phone verification SMS | Phone numbers, one-time codes | `platform/.env.local.example` |
| **Sentry** | Application error monitoring (S03-06) | Error/stack-trace data, which can incidentally include request context (URLs, non-secret parameters) at the moment of a crash. Session Replay is deliberately not enabled — see `platform/src/instrumentation-client.ts`'s own comment — specifically because this app handles real personal and payment-adjacent data and screen recording is a materially bigger privacy surface than error capture. | `platform/.env.local.example`, `backend/api/.env.example` |
| **UptimeRobot** | Uptime/availability monitoring | Only pings public health endpoints; no user data | `docs/governance/stage-03-data-backups-observability.md` |
| **GitHub Actions** | CI, and the daily production-database backup workflow | The backup workflow specifically holds a full copy of the production database (via `pg_dump`) as a workflow artifact for 30 days — effectively the same data breadth as Supabase itself, for that 30-day window. Easy to overlook as a "vendor" since it's also the code host, but it's carrying real user data. | `.github/workflows/backup-production-db.yml`, `docs/governance/backups-and-restore.md` |
| **MTN MoMo** | Mobile money payment provider | **Not live.** Gated behind `ADORWORKS_FF_REAL_PAYMENTS`, off by default, and per `platform/.env.local.example`'s own comment "has not been tested against a real sandbox in this repo." Would touch payment/financial data (transaction amounts, phone-linked mobile-money accounts) if ever enabled — worth a fresh data-role review at that point, not assumed safe by this entry. | `platform/.env.local.example` |

## What this document is not

- **Not a data processing agreement (DPA) register.** None of the above
  vendors currently has a documented DPA/subprocessor agreement with
  AdorWorks in this repo — that's a separate step (likely S13-01/S13-11's
  fuller scope) once Legal Counsel is engaged, not something built here.
- **Not a claim that every vendor above has been vetted for South Sudan
  data-residency or cross-border-transfer requirements.** `privacy.html`
  §4 already discloses cross-border transfer in general terms to users;
  whether each specific vendor's actual data-hosting location is
  appropriate is a legal question, not an engineering one.
- **Not exhaustive of every npm/library dependency** — this is about
  vendors that receive or process real user data as a running service,
  not every open-source package the codebase depends on.

## Revisit triggers

- Any new vendor integration that touches user data (a new SMS provider,
  a new payment provider, a real analytics tool, etc.) should be added
  here at integration time, not discovered later.
- `ADORWORKS_FF_REAL_PAYMENTS` being turned on for real — MTN MoMo's
  entry above would need a proper review at that point, not just a flag
  flip.
- Legal Counsel engagement (S13-01) — this document is the natural
  starting point for whatever vendor-agreement review follows.
