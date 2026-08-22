-- AdorWorks — Phase 2: phone verification (Africa's Talking OTP).
--
-- profiles.phone/phone_verified have existed since 0001 but nothing has
-- ever written to them. This adds the short-lived-code state the
-- send/verify Server Actions need.
--
-- RLS is enabled with NO policies — same pattern this project already
-- uses for verification_events/engagement_events (see
-- backend/supabase/README.md's "Why RLS instead of trust the API"
-- section): a table only the admin/service_role client should ever
-- touch, because the write path (checking the phone_verified flip) must
-- happen inside an already-authorized Server Action, never via a plain
-- user-scoped RLS grant.

create table if not exists phone_verification_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  phone text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists phone_verification_codes_user_idx on phone_verification_codes(user_id);

alter table phone_verification_codes enable row level security;
