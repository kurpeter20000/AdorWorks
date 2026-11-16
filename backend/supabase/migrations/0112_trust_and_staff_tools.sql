-- Phase B3a of the redesign spec: Trust & Safety follow-through and
-- staff support tools.
--
-- 1. "Staff feedback on posts": when staff ask for changes, they tick
--    which fields to fix; the list clears itself when the employer
--    resubmits.
-- 2. "Suspend and restore … user can appeal": appeals from suspended
--    people land in a Trust & Safety queue. A suspended account can't
--    sign in, so the appeal arrives through a public page; only the
--    backend (service role) writes these rows.
-- 3. "Person and organisation lookup … staff never need the database
--    for support": staff notes on a person, kept for every staff member
--    who helps them next. Notes are never edited or deleted (same rule
--    as the audit log).
--
-- Safe to re-run. Run AFTER 0111.

-- ---------------------------------------------------------------------
-- 1. Fields to fix on a "changes requested" opportunity.
-- ---------------------------------------------------------------------
alter table opportunities add column if not exists changes_fields text[] not null default '{}';

create or replace function clear_changes_fields_on_resubmit()
returns trigger language plpgsql as $$
begin
  if old.status = 'changes_required' and new.status is distinct from 'changes_required' then
    new.changes_fields := '{}';
  end if;
  return new;
end;
$$;
drop trigger if exists clear_changes_fields_on_resubmit on opportunities;
create trigger clear_changes_fields_on_resubmit before update on opportunities
  for each row execute function clear_changes_fields_on_resubmit();

-- ---------------------------------------------------------------------
-- 2. Suspension appeals.
-- ---------------------------------------------------------------------
create table if not exists account_appeals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  message text not null check (char_length(message) between 10 and 4000),
  status text not null default 'open' check (status in ('open', 'upheld', 'reinstated')),
  decided_by uuid references profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);
create index if not exists account_appeals_open_idx on account_appeals(created_at) where status = 'open';
-- One open appeal per person at a time: a second one adds nothing.
create unique index if not exists account_appeals_one_open_uidx on account_appeals(profile_id) where status = 'open';

alter table account_appeals enable row level security;
drop policy if exists account_appeals_staff_select on account_appeals;
create policy account_appeals_staff_select on account_appeals for select using (is_staff());
-- No insert/update/delete policies: only the backend (service role)
-- writes appeals and their decisions, so every change is audited there.
revoke insert, update, delete on account_appeals from anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Staff notes on a person.
-- ---------------------------------------------------------------------
create table if not exists staff_notes (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references profiles(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  body text not null check (char_length(body) between 2 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists staff_notes_subject_idx on staff_notes(subject_id, created_at desc);

alter table staff_notes enable row level security;
drop policy if exists staff_notes_staff_select on staff_notes;
create policy staff_notes_staff_select on staff_notes for select using (is_staff());
drop policy if exists staff_notes_staff_insert on staff_notes;
create policy staff_notes_staff_insert on staff_notes for insert with check (is_staff() and author_id = auth.uid());
revoke update, delete on staff_notes from anon, authenticated;

create or replace function staff_notes_append_only()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    -- The person's account being deleted removes their notes (cascade);
    -- nothing else may.
    if exists (select 1 from profiles where id = old.subject_id) then
      raise exception 'Staff notes cannot be deleted.' using errcode = '42501';
    end if;
    return old;
  end if;
  if new.body is distinct from old.body or new.subject_id is distinct from old.subject_id
     or new.created_at is distinct from old.created_at
     or (new.author_id is not null and new.author_id is distinct from old.author_id) then
    raise exception 'Staff notes cannot be edited.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists staff_notes_append_only on staff_notes;
create trigger staff_notes_append_only before update or delete on staff_notes
  for each row execute function staff_notes_append_only();

-- ---------------------------------------------------------------------
-- 4. The public appeal page is rate limited like login (per email and
--    per IP), so it can't be used to probe which emails are suspended.
-- ---------------------------------------------------------------------
alter table auth_rate_limit_attempts drop constraint if exists auth_rate_limit_attempts_action_check;
alter table auth_rate_limit_attempts add constraint auth_rate_limit_attempts_action_check
  check (action in ('login', 'signup', 'password_reset_request', 'mfa_challenge', 'report', 'invitation', 'account_appeal'));
