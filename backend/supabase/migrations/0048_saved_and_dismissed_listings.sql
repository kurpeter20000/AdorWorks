-- AdorWorks — Stage 4: "saved items" and "dismiss/hide" for the two
-- browse surfaces that didn't have them yet. saved_opportunities (0006)
-- already covers talent saving an opportunity; this adds the missing
-- three: dismissing an opportunity (talent), and saving/dismissing a
-- service (an employer, or anyone signed in — /services has no role
-- gate, see platform/src/app/services/page.tsx).
--
-- Run this AFTER 0047_content_reports.sql.

create table if not exists dismissed_opportunities (
  talent_id uuid not null references talent_profiles(id) on delete cascade,
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (talent_id, opportunity_id)
);
alter table dismissed_opportunities enable row level security;
drop policy if exists dismissed_opportunities_all on dismissed_opportunities;
create policy dismissed_opportunities_all on dismissed_opportunities for all
  using (talent_id = auth.uid())
  with check (talent_id = auth.uid());

-- Keyed by profiles.id ("saver_id"), not talent_id/organisation_id —
-- /services has no role gate, so whoever saves or dismisses a service
-- is just "the signed-in person", not necessarily an org representative.
create table if not exists saved_services (
  saver_id uuid not null references profiles(id) on delete cascade,
  service_id uuid not null references talent_services(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (saver_id, service_id)
);
alter table saved_services enable row level security;
drop policy if exists saved_services_all on saved_services;
create policy saved_services_all on saved_services for all
  using (saver_id = auth.uid())
  with check (saver_id = auth.uid());

create table if not exists dismissed_services (
  saver_id uuid not null references profiles(id) on delete cascade,
  service_id uuid not null references talent_services(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (saver_id, service_id)
);
alter table dismissed_services enable row level security;
drop policy if exists dismissed_services_all on dismissed_services;
create policy dismissed_services_all on dismissed_services for all
  using (saver_id = auth.uid())
  with check (saver_id = auth.uid());

-- Rollback: drop tables dismissed_opportunities, saved_services,
-- dismissed_services.
