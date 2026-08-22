import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * service_role client — bypasses RLS entirely. Only for Server Actions
 * that have ALREADY done their own authorization check (requireSession/
 * requireRole) and need to perform a multi-step, business-rule-gated
 * mutation that RLS deliberately doesn't allow a plain user session to
 * do directly (see backend/supabase/migrations/0007's comments on
 * offers/contracts/milestones/deliverables).
 *
 * Never import this into a Client Component or anything that ships to
 * the browser — the `server-only` import above makes that a build
 * error if it happens by accident.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY — copy .env.local.example to .env.local and fill both in."
    );
  }
  return createSupabaseClient<Database>(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
