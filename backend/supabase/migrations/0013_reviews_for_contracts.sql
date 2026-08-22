-- AdorWorks — extends `reviews` (0001) to also cover the new contract
-- model (0006). The table only ever referenced `engagement_id`, tied to
-- the old staff-created `engagements` table — the self-service
-- offer -> accept -> contract flow built in the Next.js app never
-- creates an `engagements` row, so a review against a `contracts` row
-- had nowhere to go. Found while building the last piece of the Phase 1
-- vertical slice (moderated two-sided reviews).
--
-- "Moderated" here means the same thing it already means for reviews.js
-- in backend/api: staff have a read-only quality dashboard, but reviews
-- are written directly by participants and visible immediately to the
-- two participants + staff (reviews_select already said "not public
-- yet" and "no update policy for regular users" — immutable, private
-- between the parties). This migration keeps that exact model, just
-- widens the scope column, rather than inventing a separate pending/
-- published workflow nothing else in this table has ever had.
--
-- Run this AFTER 0012_deliverables_storage.sql.

alter table reviews add column if not exists contract_id uuid references contracts(id) on delete cascade;
alter table reviews alter column engagement_id drop not null;

do $$ begin
  alter table reviews add constraint reviews_scope check (engagement_id is not null or contract_id is not null);
exception when duplicate_object then null; end $$;

create unique index if not exists reviews_contract_reviewer_uidx
  on reviews(contract_id, reviewer_id) where contract_id is not null;

create index if not exists reviews_contract_idx on reviews(contract_id);

drop policy if exists reviews_select on reviews;
create policy reviews_select on reviews for select
  using (
    is_staff()
    or (engagement_id is not null and is_engagement_participant(engagement_id))
    or (contract_id is not null and is_contract_participant(contract_id))
  );

-- INSERT additionally requires the contract to be 'completed' (reviews
-- happen after delivery, not mid-contract) and ties reviewer_role to
-- which side of the contract the caller actually is on — otherwise a
-- client could insert reviewer_role = 'talent' while actually being the
-- org rep (or vice versa), corrupting the one thing this table exists
-- to record accurately.
drop policy if exists reviews_insert on reviews;
create policy reviews_insert on reviews for insert
  with check (
    is_staff()
    or (
      reviewer_id = auth.uid()
      and (
        (engagement_id is not null and is_engagement_participant(engagement_id))
        or (
          contract_id is not null
          and exists (
            select 1 from contracts c
            where c.id = contract_id
              and c.status = 'completed'
              and (
                (c.talent_id = auth.uid() and reviewer_role = 'talent')
                or (is_org_member(c.organisation_id) and reviewer_role = 'employer')
              )
          )
        )
      )
    )
  );
