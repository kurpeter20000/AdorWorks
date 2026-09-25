import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

// Every request this client makes — the auth check on literally every
// page render (verifySession, via AppShell) included — sits directly on
// the critical rendering path with no fallback if it hangs. Confirmed
// directly: pointed a local server at an unregistered Supabase host and
// every page load stalled for 15+ seconds waiting on DNS/connection
// failure, since the default fetch has no timeout of its own. A real
// Supabase outage or network blip would do the same in production, not
// just against a deliberately-fake CI URL. 8s is generous for a normal
// round trip while still bounding the worst case to something a user
// might plausibly wait out, rather than an indefinite hang.
const SUPABASE_FETCH_TIMEOUT_MS = 8000;

function timeoutFetch(...args: Parameters<typeof fetch>): ReturnType<typeof fetch> {
  const [input, init] = args;
  return fetch(input, { ...init, signal: AbortSignal.timeout(SUPABASE_FETCH_TIMEOUT_MS) });
}

/**
 * Server-side Supabase client — for use in Server Components, Server
 * Actions and Route Handlers only. Reads/writes the user's auth cookies
 * so RLS sees the real signed-in user (never the service role).
 *
 * Must be created fresh per request (not module-scoped) because it
 * closes over the current request's cookie store.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database, "public">(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: timeoutFetch },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component (not a Server Action/Route
            // Handler) — cookies() is read-only there. Safe to ignore as
            // long as proxy.ts is refreshing the session on every
            // navigation (see src/proxy.ts).
          }
        },
      },
    }
  );
}
