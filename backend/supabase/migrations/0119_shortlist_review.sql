-- Shortlist builder and employer shortlist review (competitive brief,
-- 2026-11-21).
--
-- Staff build a shortlist of 3–5 verified candidates and write a short
-- reviewer note for each ("why this person"), then send it to the
-- employer. The employer reviews them side by side and, for each one,
-- moves to interview or sends a kind decline — or asks for more
-- candidates.
--
-- Writes go through the service layer (platform server actions with the
-- admin client), so no new RLS policies are needed: employers already
-- read their opportunity's shortlisted applications.
--
-- Safe to re-run. Run AFTER 0118.

alter table applications add column if not exists reviewer_note text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'applications_reviewer_note_length') then
    alter table applications add constraint applications_reviewer_note_length
      check (reviewer_note is null or char_length(reviewer_note) <= 600);
  end if;
end $$;

alter table opportunities add column if not exists shortlist_sent_at timestamptz;
alter table opportunities add column if not exists more_candidates_requested_at timestamptz;
alter table opportunities add column if not exists more_candidates_note text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'opportunities_more_candidates_note_length') then
    alter table opportunities add constraint opportunities_more_candidates_note_length
      check (more_candidates_note is null or char_length(more_candidates_note) <= 1000);
  end if;
end $$;
