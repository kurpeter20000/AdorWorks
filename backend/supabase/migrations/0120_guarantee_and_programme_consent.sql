-- Employer Guarantee and programme-partner consent (owner decisions,
-- 2026-11-21). Both are built but SWITCHED OFF until counsel approves the
-- wording: platform_settings 'guarantee' and 'programme_sharing' start
-- with enabled = false, and nothing shows to users until staff turn them
-- on in Operations → Settings.
--
-- Employer Guarantee (owner: keep the drafted windows; credit not refund;
-- replacement only while fees are 0%; one replacement per role; the
-- account contact is the staff member who sent the shortlist):
--   - opportunities.account_contact_id: the named AdorWorks contact.
--   - guarantee_requests: an employer's replacement request within the
--     window, and staff's handling of it. One per contract (not counting
--     declined ones).
--
-- Programme consent (owner: 24 months, groups under 5 never shown, under-18
-- guardian consent recorded by staff, translations checked by a person):
--   - programmes and programme_members: who joined through which partner.
--   - programme_consents: every choice the person makes, append-only, with
--     the date, language and wording version. The newest row is current.
--   - programme_summary(): group totals for a programme, empty below 5
--     people; named rows only for people who ticked that box.
--
-- Safe to re-run. Run AFTER 0119.

-- ---------------------------------------------------------------------
-- Switches (off)
-- ---------------------------------------------------------------------
insert into platform_settings (key, value) values ('guarantee', '{"enabled": false}'::jsonb)
on conflict (key) do nothing;
insert into platform_settings (key, value) values ('programme_sharing', '{"enabled": false}'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Employer Guarantee
-- ---------------------------------------------------------------------
alter table opportunities add column if not exists account_contact_id uuid references profiles(id);

create table if not exists guarantee_requests (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts(id) on delete cascade,
  organisation_id uuid not null references organisations(id) on delete cascade,
  requested_by uuid not null references profiles(id),
  reason text not null check (reason in ('scope_missed', 'left_early', 'skills_missing', 'other')),
  details text not null check (char_length(details) between 10 and 2000),
  status text not null default 'open'
    check (status in ('open', 'replacement_sent', 'credited', 'declined', 'closed')),
  staff_note text check (staff_note is null or char_length(staff_note) <= 2000),
  resolved_by uuid references profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists guarantee_requests_status_idx on guarantee_requests(status, created_at);
-- One replacement per role: a declined request doesn't use it up.
create unique index if not exists guarantee_requests_one_per_contract
  on guarantee_requests(contract_id) where status <> 'declined';

alter table guarantee_requests enable row level security;
drop policy if exists guarantee_requests_select on guarantee_requests;
create policy guarantee_requests_select on guarantee_requests for select
  using (is_org_member(organisation_id) or is_staff());
-- Writes only through the service layer.

-- ---------------------------------------------------------------------
-- Programme partners and consent
-- ---------------------------------------------------------------------
create table if not exists programmes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 160),
  partner_name text not null check (char_length(partner_name) between 2 and 160),
  -- Named data may only be shown once the data-sharing agreement is signed.
  agreement_signed_at timestamptz,
  ends_on date,
  active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists programme_members (
  programme_id uuid not null references programmes(id) on delete cascade,
  talent_id uuid not null references profiles(id) on delete cascade,
  is_minor boolean not null default false,
  joined_at timestamptz not null default now(),
  added_by uuid references profiles(id),
  primary key (programme_id, talent_id)
);

create table if not exists programme_consents (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references programmes(id) on delete cascade,
  talent_id uuid not null references profiles(id) on delete cascade,
  share_named_progress boolean not null default false,
  share_earnings boolean not null default false,
  share_story boolean not null default false,
  language text not null check (language in ('en', 'ar', 'sw')),
  wording_version text not null,
  -- Under-18s: the guardian who agreed, recorded by staff in person.
  guardian_name text check (guardian_name is null or char_length(guardian_name) <= 160),
  recorded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists programme_consents_latest_idx on programme_consents(programme_id, talent_id, created_at desc);

alter table programmes enable row level security;
alter table programme_members enable row level security;
alter table programme_consents enable row level security;

drop policy if exists programmes_select on programmes;
create policy programmes_select on programmes for select
  using (is_staff() or exists (select 1 from programme_members m where m.programme_id = programmes.id and m.talent_id = auth.uid()));
drop policy if exists programme_members_select on programme_members;
create policy programme_members_select on programme_members for select
  using (is_staff() or talent_id = auth.uid());
drop policy if exists programme_consents_select on programme_consents;
create policy programme_consents_select on programme_consents for select
  using (is_staff() or talent_id = auth.uid());
-- Writes only through the service layer (append-only history).

-- Group totals for a programme, with the privacy floor built in: nothing
-- at all for groups under 5, and named rows only for people whose newest
-- choice says yes AND only once the agreement is signed. Staff-only today;
-- the partner dashboard will call the same function.
create or replace function programme_summary(p_programme uuid)
returns table (
  members int,
  verified int,
  placed int,
  paid int,
  named_talent_id uuid,
  named_name text,
  named_tier text,
  named_contracts int,
  named_earnings numeric,
  named_currency text
)
language sql
stable
security definer
set search_path = public
as $$
  with m as (
    select pm.talent_id from programme_members pm where pm.programme_id = p_programme
  ),
  totals as (
    select
      (select count(*) from m)::int as members,
      (select count(*) from m join talent_profiles tp on tp.id = m.talent_id
        where tp.verification_tier in ('identity_verified', 'adorverified', 'adorcertified', 'team_lead'))::int as verified,
      (select count(distinct c.talent_id) from contracts c join m on m.talent_id = c.talent_id)::int as placed,
      (select count(distinct c.talent_id) from payment_events pe join contracts c on c.id = pe.contract_id
        join m on m.talent_id = c.talent_id where pe.status = 'succeeded')::int as paid
  ),
  latest as (
    select distinct on (pc.talent_id) pc.*
    from programme_consents pc
    where pc.programme_id = p_programme
    order by pc.talent_id, pc.created_at desc
  ),
  named as (
    select l.talent_id, l.share_earnings,
           coalesce(nullif(tp.display_name, ''), p.full_name) as name,
           tp.verification_tier::text as tier,
           (select count(*)::int from contracts c where c.talent_id = l.talent_id) as contracts
    from latest l
    join programmes pr on pr.id = p_programme and pr.agreement_signed_at is not null
    join programme_members pm on pm.programme_id = p_programme and pm.talent_id = l.talent_id
    join talent_profiles tp on tp.id = l.talent_id
    join profiles p on p.id = l.talent_id
    where l.share_named_progress
      and (not pm.is_minor or l.guardian_name is not null)
  )
  select t.members, t.verified, t.placed, t.paid,
         n.talent_id, n.name, n.tier, n.contracts,
         case when n.share_earnings then
           (select sum(pe.net_amount) from payment_events pe join contracts c on c.id = pe.contract_id
             where c.talent_id = n.talent_id and pe.status = 'succeeded') end,
         case when n.share_earnings then
           (select min(pe.currency) from payment_events pe join contracts c on c.id = pe.contract_id
             where c.talent_id = n.talent_id and pe.status = 'succeeded') end
  from totals t
  left join named n on true
  where is_staff() and t.members >= 5;
$$;

revoke all on function programme_summary(uuid) from public, anon;
grant execute on function programme_summary(uuid) to authenticated;
