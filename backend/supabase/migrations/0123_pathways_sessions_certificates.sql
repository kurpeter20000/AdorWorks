-- Pathways, part 2 (PATHWAYS.md): sessions and attendance, facilitators,
-- session feedback, certificates with a check code, and Internship Bridge
-- supervisor reviews.
--
-- 1. programme_facilitators: who may run a cohort's sessions. Access only
--    once staff have recorded a background check (safeguarding, under-18s).
-- 2. programme_sessions + programme_attendance: each session has a short
--    check-in code (shown as a QR code). Participants check in themselves;
--    a facilitator can also mark someone present by their phone number —
--    facilitators never get a list of participants' names. Participants
--    can rate the session 1–5.
-- 3. programme_certificates: issued to a participant, verifiable by anyone
--    with the check code on the Verify page.
-- 4. internship_reviews: the supervisor's mid-point and final review on an
--    internship contract (Internship Bridge). Stipends are paid as
--    milestones through the normal MTN MoMo / mGurush / bank flow.
--
-- All writes go through the service layer. Safe to re-run. Run AFTER 0122.

-- 1. Facilitators ------------------------------------------------------------
create table if not exists programme_facilitators (
  programme_id uuid not null references programmes(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  background_check_recorded_at timestamptz,
  background_check_note text check (background_check_note is null or char_length(background_check_note) <= 500),
  recorded_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  primary key (programme_id, user_id)
);
alter table programme_facilitators enable row level security;
drop policy if exists programme_facilitators_select on programme_facilitators;
create policy programme_facilitators_select on programme_facilitators for select
  using (is_staff() or user_id = auth.uid());

-- 2. Sessions and attendance -------------------------------------------------
create table if not exists programme_sessions (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references programmes(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 160),
  starts_at timestamptz not null,
  location text check (location is null or char_length(location) <= 160),
  checkin_code text not null,
  checkin_open boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create unique index if not exists programme_sessions_checkin_code_uidx on programme_sessions(upper(checkin_code));
create index if not exists programme_sessions_programme_idx on programme_sessions(programme_id, starts_at);

create table if not exists programme_attendance (
  session_id uuid not null references programme_sessions(id) on delete cascade,
  talent_id uuid not null references profiles(id) on delete cascade,
  method text not null check (method in ('code', 'facilitator')),
  marked_by uuid references profiles(id),
  feedback_score int check (feedback_score is null or feedback_score between 1 and 5),
  checked_in_at timestamptz not null default now(),
  primary key (session_id, talent_id)
);

alter table programme_sessions enable row level security;
alter table programme_attendance enable row level security;
drop policy if exists programme_sessions_select on programme_sessions;
create policy programme_sessions_select on programme_sessions for select
  using (is_staff() or exists (select 1 from programme_members m where m.programme_id = programme_sessions.programme_id and m.talent_id = auth.uid()));
drop policy if exists programme_attendance_select on programme_attendance;
create policy programme_attendance_select on programme_attendance for select
  using (is_staff() or talent_id = auth.uid());

-- 3. Certificates ------------------------------------------------------------
create table if not exists programme_certificates (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references programmes(id) on delete cascade,
  talent_id uuid not null references profiles(id) on delete cascade,
  check_code text not null,
  issued_by uuid references profiles(id),
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (programme_id, talent_id)
);
create unique index if not exists programme_certificates_check_code_uidx on programme_certificates(upper(check_code));
alter table programme_certificates enable row level security;
drop policy if exists programme_certificates_select on programme_certificates;
create policy programme_certificates_select on programme_certificates for select
  using (is_staff() or talent_id = auth.uid());

-- Public check: name, programme, partner and date for a valid code — never contact details.
create or replace function verify_certificate(p_code text)
returns table (talent_name text, programme_name text, partner_name text, programme_type text, issued_at timestamptz, revoked boolean)
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(tp.display_name, ''), p.full_name, 'AdorWorks participant'),
         pr.name, pr.partner_name, pr.programme_type, c.issued_at, c.revoked_at is not null
  from programme_certificates c
  join programmes pr on pr.id = c.programme_id
  join profiles p on p.id = c.talent_id
  left join talent_profiles tp on tp.id = c.talent_id
  where upper(c.check_code) = upper(trim(p_code));
$$;
revoke all on function verify_certificate(text) from public;
grant execute on function verify_certificate(text) to anon, authenticated;

-- 4. Internship Bridge supervisor reviews -------------------------------------
create table if not exists internship_reviews (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts(id) on delete cascade,
  stage text not null check (stage in ('mid_point', 'final')),
  supervisor_id uuid not null references profiles(id),
  score_skills int not null check (score_skills between 1 and 5),
  score_reliability int not null check (score_reliability between 1 and 5),
  score_growth int not null check (score_growth between 1 and 5),
  strengths text check (strengths is null or char_length(strengths) <= 2000),
  to_improve text check (to_improve is null or char_length(to_improve) <= 2000),
  created_at timestamptz not null default now(),
  unique (contract_id, stage)
);
alter table internship_reviews enable row level security;
drop policy if exists internship_reviews_select on internship_reviews;
create policy internship_reviews_select on internship_reviews for select
  using (is_staff() or is_contract_participant(contract_id));
