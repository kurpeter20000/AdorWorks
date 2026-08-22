-- AdorWorks — Phase 2: talent Passport, portfolio items, professional links.
--
-- The onboarding wizard already collects headline/bio/skills/languages/
-- category/location, but there is no public profile page to show them on,
-- and no way to add more than one portfolio piece (only the single scalar
-- talent_profiles.portfolio_url from 0001). This adds:
--   - three named link columns on talent_profiles (linkedin/github/website)
--   - a talent_portfolio_items table for a real multi-item gallery
--   - a public storage bucket for portfolio images
--
-- talent_portfolio_items doesn't inherit talent_profiles' RLS, so it needs
-- its own select policy mirroring 0015_fix_talent_visibility_helper.sql's
-- shape (owner, staff, or the parent profile is public_visible).

alter table talent_profiles add column if not exists linkedin_url text;
alter table talent_profiles add column if not exists github_url text;
alter table talent_profiles add column if not exists website_url text;

create table if not exists talent_portfolio_items (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references talent_profiles(id) on delete cascade,
  title text not null,
  description text,
  external_url text,
  file_path text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint talent_portfolio_items_has_content check (external_url is not null or file_path is not null)
);
create index if not exists talent_portfolio_items_talent_idx on talent_portfolio_items(talent_id);

alter table talent_portfolio_items enable row level security;

drop policy if exists talent_portfolio_items_select on talent_portfolio_items;
create policy talent_portfolio_items_select on talent_portfolio_items for select
  using (
    talent_id = auth.uid()
    or is_staff()
    or exists (
      select 1 from talent_profiles tp
      where tp.id = talent_portfolio_items.talent_id and tp.public_visible = true
    )
  );

drop policy if exists talent_portfolio_items_insert on talent_portfolio_items;
create policy talent_portfolio_items_insert on talent_portfolio_items for insert
  with check (talent_id = auth.uid());

drop policy if exists talent_portfolio_items_delete on talent_portfolio_items;
create policy talent_portfolio_items_delete on talent_portfolio_items for delete
  using (talent_id = auth.uid());

-- ---------------------------------------------------------------------
-- Storage — public bucket for portfolio images (unlike the private
-- talent-evidence bucket, these are meant to be freely viewable on a
-- public Passport page). Policy included in this same migration — a
-- bucket without one silently accepts no writes (see 0012's history).
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('talent-portfolio', 'talent-portfolio', true)
on conflict (id) do nothing;

drop policy if exists talent_portfolio_owner_write on storage.objects;
create policy talent_portfolio_owner_write on storage.objects for all
  using (
    bucket_id = 'talent-portfolio'
    and ((storage.foldername(name))[1] = auth.uid()::text or is_staff())
  )
  with check (
    bucket_id = 'talent-portfolio'
    and ((storage.foldername(name))[1] = auth.uid()::text or is_staff())
  );
