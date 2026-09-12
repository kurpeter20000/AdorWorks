-- AdorWorks — S03-03 index review: close a real missing-index gap found
-- while auditing every table against its actual query patterns.
--
-- verification_events has no index beyond its primary key (id). Every
-- load of the staff console's talent-detail view runs
-- `select * from verification_events where talent_id = :id order by
-- created_at desc` (backend/api/src/routes/talent.js, GET /api/talent/:id)
-- — a sequential scan today, and one that gets slower on every future
-- verification-tier change across every talent, not just this one's.
-- Composite (talent_id, created_at desc) matches that query's filter and
-- sort exactly.
--
-- Everything else flagged as "no explicit index" during this review
-- (saved/dismissed_opportunities, saved/dismissed_services,
-- conversation_members, screening_answers, talent_introduction_videos)
-- turned out to already be covered by a composite primary key or unique
-- constraint whose leading column matches how the app actually queries
-- them — confirmed against real call sites, not assumed. honorifics,
-- partner_hubs and onboarding_agents are small reference/lookup tables
-- with no hot lookup-by-column pattern. No other new index is needed.

create index if not exists verification_events_talent_idx
  on verification_events (talent_id, created_at desc);

-- Rollback: drop index if exists verification_events_talent_idx;
