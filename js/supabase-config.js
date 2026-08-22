/*
  See backend/supabase/README.md for how this project was created and
  the schema applied.

  Both values here are PUBLIC by design — the Project URL and the
  "publishable" key (Supabase's newer name for what used to be called
  the "anon" key) are meant to ship in frontend code; Row Level Security
  (not secrecy) is what keeps this safe. Never put the "secret" /
  "service_role" key here or anywhere in this site's code — that one is
  server-only (it lives in backend/api/.env instead, never committed).
*/
window.ADORWORKS_SUPABASE_URL = "https://cpiebggzbxshzvlzqdfn.supabase.co";
window.ADORWORKS_SUPABASE_ANON_KEY = "sb_publishable_7DGYFu8GzBwM0WwcDnEmnQ_Ha73j8hq";
