-- AdorWorks — S07-11: secure opportunity attachments.
--
-- No attachment feature existed at all for opportunities — this adds one
-- following the same private-bucket + signed-URL pattern already used for
-- talent-evidence/org-documents (0004) and talent-portfolio (0055/0065):
-- the bucket itself is private and only reachable by the opportunity's own
-- org write-members and staff directly. A talent viewing the opportunity
-- never gets direct bucket access — the apply page mints a short-lived
-- signed URL server-side, only after the same status='open'/
-- visibility='public' check it already applies to the opportunity itself
-- (platform/src/app/opportunities/[id]/apply/page.tsx), so a private/
-- unapproved opportunity's attachments can't be reached even with a
-- guessed storage path.
--
-- Upload path convention: opportunity-attachments/{opportunity_id}/{filename}
--
-- Run this AFTER 0076_opportunity_reopen.sql.

create table if not exists opportunity_attachments (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  path text not null,
  filename text not null,
  content_type text not null,
  size_bytes integer not null,
  uploaded_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists opportunity_attachments_opportunity_idx on opportunity_attachments(opportunity_id);

alter table opportunity_attachments enable row level security;

-- Metadata rows: org write-members of the opportunity and staff. A talent
-- never queries this table directly — the apply page reads it with the
-- admin client after its own visibility check, same as it already does
-- for the opportunity row itself.
drop policy if exists opportunity_attachments_select on opportunity_attachments;
create policy opportunity_attachments_select on opportunity_attachments for select
  using (
    is_staff()
    or exists (select 1 from opportunities o where o.id = opportunity_id and is_org_write_member(o.organisation_id))
  );

drop policy if exists opportunity_attachments_insert on opportunity_attachments;
create policy opportunity_attachments_insert on opportunity_attachments for insert
  with check (
    uploaded_by = auth.uid()
    and (
      is_staff()
      or exists (select 1 from opportunities o where o.id = opportunity_id and is_org_write_member(o.organisation_id))
    )
  );

drop policy if exists opportunity_attachments_delete on opportunity_attachments;
create policy opportunity_attachments_delete on opportunity_attachments for delete
  using (
    is_staff()
    or exists (select 1 from opportunities o where o.id = opportunity_id and is_org_write_member(o.organisation_id))
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'opportunity-attachments', 'opportunity-attachments', false, 8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do nothing;

drop policy if exists opportunity_attachments_owner_all on storage.objects;
create policy opportunity_attachments_owner_all on storage.objects
  for all
  using (
    bucket_id = 'opportunity-attachments'
    and (
      is_staff()
      or exists (
        select 1 from opportunities o
        where o.id::text = (storage.foldername(name))[1]
          and is_org_write_member(o.organisation_id)
      )
    )
  )
  with check (
    bucket_id = 'opportunity-attachments'
    and (
      is_staff()
      or exists (
        select 1 from opportunities o
        where o.id::text = (storage.foldername(name))[1]
          and is_org_write_member(o.organisation_id)
      )
    )
  );

-- Rollback: drop table opportunity_attachments; delete from
-- storage.buckets where id = 'opportunity-attachments'; drop policy
-- opportunity_attachments_owner_all on storage.objects.
