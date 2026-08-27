# Stage 0 — Audit and Integration Map

Audit date: 2026-08-27

Baseline: `b56b08e` (`origin/main`)

Scope: repository, deployed surfaces, data model, permissions, workflows, tests, and the integrated three-dashboard brief.

Stage 0 was completed read-only. No source, schema, configuration, dependency, or production-data change was made during the audit.

## 1. What exists today

- A static, mobile-first public site at the repository root, deployed through Netlify, with six intake/contact forms, PWA support, honest empty states, and analytics data-layer hooks.
- A Next.js platform in `platform/`, deployed through Vercel, with authentication, talent onboarding and Passport, employer organisations, opportunities, applications, offers, contracts, milestones, deliverables, messages, timesheets, disputes, reviews, assisted access, and simulated payments.
- A Supabase backend with 30 ordered migrations, PostgreSQL enums and tables, Auth, Storage, Row Level Security, and functions/triggers.
- A Node/Express staff API in `backend/api/`, deployed through Render, for intake, verification, shortlisting, contracts, finance records, and disputes.
- A static staff console in `staff/` that exercises the staff API.
- CI that runs platform lint, unit tests, API tests, and a production platform build.
- Separate legacy concierge `engagements` and newer self-service `contracts` work models.
- A staff-curated `service_packages` catalogue and `type=service` opportunities; no talent-authored Fiverr-style service/order marketplace exists.

Observed deployment health on 2026-08-27:

| Surface | Observed URL | Result |
| --- | --- | --- |
| Public site | `https://adorworks.netlify.app` | HTTP 200 |
| Platform | `https://ador-works.vercel.app` | HTTP 200 |
| Staff API | `https://adorworks-api.onrender.com/health` | HTTP 200 after cold start |
| Planned custom domain | `adorworks.com` | DNS did not resolve |

## 2. What must be preserved

- Existing account IDs, profile records, organisation records, URLs, deep links, and working talent/employer journeys.
- Supabase as identity, database, RLS, and storage foundation; no parallel auth or database.
- The static public site and staff console until replacement routes reach operational parity.
- Concierge shortlisting and staff review alongside self-service shortlisting.
- Simulated-payment honesty: never represent a mock provider event as movement of real money.
- AdorWorks brand tokens, mobile-first behaviour, accessible focus treatment, and truthful empty states.
- Migration order, additive migration discipline, and production data.
- User-owned uncommitted files and unrelated repository changes.

## 3. Gap matrix across all three dashboards

| Requirement | Talent today | Employer today | Operations today | Gap | Additive change |
| --- | --- | --- | --- | --- | --- |
| Shared role context | One global `profiles.role` | Same global role; invitations may rewrite it | Four broad staff roles | No multi-role identity/context separation | Add role assignments and explicit active context behind a flag; preserve `profiles.role` during transition |
| Shared navigation | Talent dashboard links are hard-coded | Only two employer roles received cards | Staff uses separate console | Valid org and assisted roles can land on an empty dashboard | Central role grouping and navigation contract; preserve staff console |
| State terminology | Labels duplicated across pages | Labels duplicated and sometimes different | API/console exposes raw values | Inconsistent user-facing status language | Typed state catalogue and reusable badge |
| Permissions | Talent RLS covers core records | Representative/member rules vary by resource | `is_staff` is broad | Role names do not express action/resource scope | Add policy functions and tests before narrowing access |
| Organisation tenancy | Not applicable except contract party | Representative and members coexist | Staff can broadly inspect | App queries often use representative only; invitation can overwrite role | Central organisation membership service; additive roles/assignments |
| Opportunity lifecycle | Browse/apply/save | Draft, submit, self/curated shortlist | Review and publish | No shared transition service or event history | Add transition commands, reasons, and audit outbox |
| Application pipeline | Tracker exists | Applicant list and shortlist actions exist | Curated shortlist exists | No interview plans, scorecards, versions, or activity history | Add structured pipeline entities after permission boundary |
| Matching | Search/filter and curated shortlist | Applicants visible by mode | Human curation | No explainability, saved-search alerts, diversity/exploration rules, or health metrics | Add shared matching facts and explanations behind flags |
| Talent media | Image, links, evidence, portfolio | Passport can be viewed | Verification evidence review | Public queries bypass the safer view; no video lifecycle/moderation | Route public reads through safe view; later add protected media pipeline |
| Services | Talent sees opportunities | Employer can request/post work | Staff curates packages | Packages are not a talent service marketplace | Keep package catalogue separate; design service/order domain later |
| Delivery and payments | Contract delivery and mock receipts | Review/pay through mock provider | Reconciliation and disputes | Multi-step writes lack transaction/idempotency boundaries | Add server transaction commands and idempotency keys before real providers |
| Audit and notifications | Mostly current-state UI | Mostly current-state UI | Point queues/logs | No general audit log, outbox, preferences, or delivery health | Add append-only audit/outbox and notification preferences |
| UI states | Several local empty/success messages | Several local messages | Console-specific patterns | Loading/error/offline/denied patterns are inconsistent | Shared state panels and route-level boundaries |
| Analytics | No coherent product taxonomy | Same | No marketplace-health view | Public dataLayer only; no consent wiring or product event contract | Fix event vocabulary first; add consent and operations metrics later |

## 4. Shared architecture and service map

```text
Public site (static) ───────────────┐
                                    ├─ Supabase Auth/Postgres/Storage
Talent + Employer platform (Next) ─┤   ├─ RLS is the final data boundary
                                    │   └─ migrations are the schema source of truth
Staff console (static) ─ Express API┘
                              └─ service-role access; API authorization is mandatory

Shared contracts to converge on:
identity/roles → organisation tenancy → workflow commands → state/event history
                 taxonomy/matching ─────┘                    ├─ notifications
                 media/evidence ──────────────────────────────┤
                 contracts/payments/cases ────────────────────┴─ operations health
```

Authoritative services should remain within the current stack. Next.js server actions/DAL own platform commands, Supabase owns durable rules and tenant isolation, and the staff API owns authenticated operational commands until an operations replacement is approved.

## 5. Route/component reuse map

| Capability | Current route/surface | Reuse decision |
| --- | --- | --- |
| Account entry | `/login`, `/signup`, `/forgot-password`, `/auth/*` | Preserve; add role context only behind a flag |
| Shared landing | `/dashboard` | Use one role-to-experience contract |
| Talent identity | `/onboarding`, `/passport`, `/passport/[id]` | Preserve; route public data through safe projection before broader discovery |
| Talent demand | `/opportunities`, `/opportunities/[id]`, `/applications`, `/offers` | Preserve routes; share status/transition contracts |
| Employer tenancy | `/organisation`, `/organisation/team` | Preserve; centralise membership checks and repair representative-only queries later |
| Employer demand | `/organisation/opportunities/new`, `/organisation/opportunities/[id]` | Preserve; reuse opportunity and application state definitions |
| Work delivery | `/contracts`, `/contracts/[id]` | Preserve; consolidate commands transactionally in a later stage |
| Assisted access | `/assistance/request`, `/assist` | Preserve; enforce expiry/action audit before expansion |
| Operations | `staff/` plus `backend/api/` | Preserve until route-by-route operational parity exists |
| Public conversion | root HTML pages and forms | Preserve through Stage 9; publish a route/content ownership contract now |
| Common UI | Tailwind tokens in platform and CSS variables in public/staff | Reuse palette; add small accessible primitives, not a new design system |

## 6. State and event map

Current durable states:

| Aggregate | Current states | Immediate contract |
| --- | --- | --- |
| Opportunity | `draft`, `pending_review`, `open`, `filled`, `closed`, `cancelled`, `rejected` | One typed label/tone catalogue |
| Application | `submitted`, `shortlisted`, `interviewing`, `offered`, `accepted`, `rejected`, `withdrawn` | One typed label/tone catalogue |
| Offer | `draft`, `sent`, `accepted`, `declined`, `withdrawn` | One typed label/tone catalogue |
| Contract | `active`, `completed`, `cancelled`, `disputed` | One typed label/tone catalogue |
| Milestone | `pending`, `submitted`, `approved`, `revision_requested`, `paid` | One typed label/tone catalogue |
| Organisation verification | `pending`, `verified`, `rejected`, `suspended` | One typed label/tone catalogue |

The Stage 1 event vocabulary covers identity, profile, verification, assistance, opportunity, application, offer, contract, milestone, messaging, disputes, and payments. Stage 1 defines names only. Later stages must emit events only after successful commands through a durable audit/outbox mechanism with actor, entity, timestamp, reason, before/after, and source.

## 7. Role-action-resource permission matrix

Legend: **Yes** = directly represented and substantially supported; **Partial** = broader/different current role; **No** = not represented as a distinct enforceable role.

| Required role | Current mapping | Core action/resource boundary | Coverage |
| --- | --- | --- | --- |
| Talent | `talent` | Own profile, applications, offers, contracts, deliverables | Yes |
| Employer organisation owner/admin | `individual_client`, `employer`, `org_admin` | Organisation, team, opportunities, applicants, contracts | Partial |
| Recruiter | `org_member` at most | Sourcing and pipeline, no finance/admin | No |
| Hiring manager | `org_member` at most | Assigned opportunities and hiring decisions | No |
| Interviewer/reviewer | `org_member` or staff `reviewer` | Assigned scorecards/interviews only | No |
| Finance | Staff `finance`; no employer finance role | Invoices/payments without hiring/private profile administration | Partial |
| Employer viewer/auditor | None | Read-only organisation records | No |
| AdorWorks support | Broad staff roles | Support metadata, not sensitive evidence by default | Partial |
| AdorWorks verifier | `reviewer` | Verification queue/evidence/decision | Partial |
| AdorWorks moderator | Broad staff roles | Listings/media/report moderation | Partial |
| AdorWorks case manager | Broad staff roles | Disputes and legitimate-case access | Partial |
| AdorWorks finance/operations | `finance` | Finance records/reconciliation | Partial |
| AdorWorks admin/security auditor | `admin` | Role/security audit and controlled emergency access | Partial |

Highest-priority violations to repair before expanding permissions:

- An organisation invitation can overwrite an existing user's single global role.
- `is_staff` grants reviewer, matcher, finance, and admin a broad common access class.
- Timesheet update policy does not encode who may approve a timesheet.
- Assistance expiry exists in data but is not consistently enforced at access time.
- Organisation member support varies between RLS and application queries.

## 8. Operational-parity matrix

| User capability | Required operations capability | Today | Gate |
| --- | --- | --- | --- |
| Verification | Evidence queue, decision, reason, audit | Queue/decision exists | Add scoped verifier role and audit |
| Opportunity submission | Review, publish/reject, reason | Exists | Share transitions and event history |
| Self-service shortlisting | Integrity visibility and intervention | Partial | Add pipeline health and scoped intervention |
| Offers/contracts | Oversight without unrestricted message access | Partial | Define legitimate-case access and audit |
| Disputes | Case queue, evidence, resolution reason | Exists | Separate case-manager scope |
| Assisted access | Consent, expiry, revoke, action trail | Partial | Enforce expiry and user-visible audit |
| Payments | Reconciliation, failure/retry visibility | Simulated reconciliation exists | Keep real payments flagged off |
| Profile/media publishing | Moderation/removal/appeal | Evidence verification only | Required before video/public expansion |
| Matching/recommendations | Explanation and marketplace-health view | Human curation only | Required with automated matching |
| Notifications | Delivery failure/retry health | No | Required with transactional delivery |

## 9. Data/API/migration proposal

No migration is approved or included in Stage 1. Proposed additive sequence for later approval:

1. Add role assignments, organisation-scoped memberships, permission scopes, and active-context support while retaining `profiles.role` as a compatibility field.
2. Add an append-only `audit_events` table and transactional outbox with actor/entity/reason/before/after metadata and idempotency keys.
3. Add central transition functions for opportunities, applications, offers, contracts, milestones, assistance, and disputes.
4. Repair public Passport reads to use a safe projection and tighten base-table policy without breaking existing public URLs.
5. Add structured interviews, scorecards, activity history, notification preferences/deliveries, and matching explanations only in their approved stages.
6. Keep curated packages distinct; add service listings/orders only after their lifecycle, fees, moderation, and operations model is approved.

Every migration requires forward/rollback notes, policy tests, production-data compatibility checks, and generated database types.

## 10. File-level plan for Stages 1–10

| Stage | Primary file areas | Planned change |
| --- | --- | --- |
| 1 — Foundations | `platform/src/lib/domain/`, shared components, DAL, dashboard, `.github/` | Typed roles/states/events/flags, navigation, UI-state and review contracts |
| 2 — Identity/tenancy | Supabase migrations, generated types, auth/DAL, org routes, staff API | Add role assignments and scoped organisation permissions |
| 3 — Profiles/taxonomy/trust | Profile routes, taxonomy services, verification API/console | Shared facts, safe visibility, verification audit |
| 4 — Demand/catalogues | Opportunity and service domains, public projections, review queues | Separate opportunities from service listings and packages |
| 5 — Discovery/matching | Search DAL, saved searches, explanation components, health queue | Explainable search/matching and user controls |
| 6 — Pipeline | Applications, invitations, interviews, scorecards, offers, operations | One audited cross-dashboard hiring pipeline |
| 7 — Media/moderation | Storage policies, processing adapters, media UI, moderation queue | Protected upload/process/moderate/publish/delete lifecycle |
| 8 — Notifications/delivery | Outbox workers, preferences, notification UI, delivery health | Idempotent transactional notifications and operations recovery |
| 9 — Public site | Static/public routes, content ownership, SEO, consent analytics | Align public journeys after product facts stabilise |
| 10 — Hardening/release | E2E/security/accessibility/performance suites, runbooks | Tenant and role proofs, privacy review, rollout and rollback |

## 11. Security, privacy, trust, accessibility and performance risks

- **Critical permission design:** global role mutation, broad staff checks, inconsistent organisation membership, and timesheet approval policy.
- **Privacy:** public base-table access may expose more talent-profile columns than intended; evidence retention/export/deletion rules are incomplete.
- **Trust:** no general audit log, reason enforcement, maker-checker control, appeal trail, or notification history.
- **Transaction integrity:** several offer/contract/payment flows perform multiple writes without one transactional/idempotent command.
- **Upload security:** client checks exist, but server/storage limits and MIME/content validation require tightening.
- **API security:** staff API has no explicit rate limiter and requires stricter scoped roles before capability growth.
- **Web security:** CSP, HSTS, and Permissions-Policy are not defined; legal policy/reporting endpoints remain content-pending.
- **Accessibility:** shared loading/error/denied patterns and full keyboard/screen-reader checks are incomplete.
- **Performance/reliability:** Google-hosted font access affects isolated builds; Render cold starts occur; product telemetry and error reporting are incomplete.
- **Test safety:** E2E helpers mutate Supabase data; they must not run until a disposable test project is proven.

## 12. Test, rollout and rollback plan

- Baseline verified: platform production build, platform lint, platform unit tests, and staff API tests pass.
- Do not run mutating E2E against an unconfirmed Supabase project. Provision and assert a dedicated project first.
- Require unit coverage for exhaustive state/role mappings and integration tests for each server-side action/resource boundary.
- Add tenant-isolation tests before role/organisation migrations and transactional tests before payment or offer consolidation.
- Ship material capabilities default-off through `ADORWORKS_FF_*` server flags.
- Use small review-branch commits; never push Stage work directly to the auto-deploying default branch.
- Roll back Stage 1 by reverting its additive commit. It has no migration, dependency, environment, or persisted-data effect.
- For later migrations, deploy compatibility code before schema use, preserve old fields, and document a forward fix plus safe feature-flag disable path.

## 13. Blocking questions only

These do not block the low-risk Stage 1 contract slice; they block later stages:

1. Which Supabase project is disposable and explicitly authorised for E2E mutation?
2. Should one identity support simultaneous Talent and Employer profiles, and who may assign each role?
3. Which of the 13 required operations/employer roles are needed for the first production release?
4. Is the canonical public domain `adorworks.com`, and who owns DNS, legal policy content, analytics consent, and the monitored reporting channel?
5. Which licensed payment/recruitment partners and jurisdictions are approved before any real-money or regulated-placement implementation?
