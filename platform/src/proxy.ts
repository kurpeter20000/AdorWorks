import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Runs on every request (see matcher below) to refresh the Supabase
 * auth session cookie before it expires. This is an OPTIMISTIC check
 * only — it keeps sessions alive and can do cheap redirects, but real
 * authorization happens server-side per the Next.js auth guide's Data
 * Access Layer pattern (src/lib/dal) and, underneath that, Postgres RLS.
 * Never trust this file as the only gate on sensitive data.
 *
 * Named `proxy.ts` (not `middleware.ts`) per this Next.js version's
 * renamed convention — same underlying mechanism.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Touching getUser() is what actually triggers a token refresh when
  // the access token is close to expiry — getSession() alone won't.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on every route except static assets and Next's internals —
     * auth state can matter anywhere, but there's nothing to refresh
     * for images/fonts/etc.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
