import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * A Supabase client for actions that EMAIL someone a sign-in link —
 * password reset and signup confirmation.
 *
 * Why not the normal server client (lib/supabase/server.ts): @supabase/ssr
 * always uses the PKCE flow, where the emailed link only works in the
 * very browser that asked for it (a secret "code verifier" is saved in
 * that browser's cookies and must be presented when the link is opened).
 * Someone who requests a reset on a laptop and taps the link in their
 * phone's mail app has no verifier there, the code exchange fails, and
 * they were bounced to /login (owner report, Nov 2026).
 *
 * The implicit flow puts the session in the link itself
 * (#access_token=…&type=recovery), which /auth/callback already handles,
 * so the link works on any device. Nothing is stored server-side.
 */
export function createEmailLinkClient() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
