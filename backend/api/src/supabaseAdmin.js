import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env and fill in your project's values (Project Settings -> API)."
  );
}

// service_role bypasses Row Level Security — this client must never be
// exposed to the frontend. Every route that uses it is responsible for
// checking req.user's role itself (see middleware/auth.js) before doing
// anything privileged with it.
export const supabaseAdmin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
