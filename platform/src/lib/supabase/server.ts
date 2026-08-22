import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

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

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
