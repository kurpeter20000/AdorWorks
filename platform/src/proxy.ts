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

// Supabase's refresh token has no inactivity limit of its own — as long
// as something keeps hitting this proxy, the getUser() call below keeps
// renewing it forever, so a session that's merely left open never signs
// itself out. Enforce an idle timeout ourselves via a plain (non-auth)
// cookie stamped with the last request time and checked on every request.
const INACTIVITY_LIMIT_MS = 30 * 60 * 1000; // 30 minutes
const LAST_ACTIVE_COOKIE = "aw_last_active";

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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    response.cookies.delete(LAST_ACTIVE_COOKIE);
    return response;
  }

  const now = Date.now();
  const lastActive = Number(request.cookies.get(LAST_ACTIVE_COOKIE)?.value);

  if (Number.isFinite(lastActive) && now - lastActive > INACTIVITY_LIMIT_MS) {
    // Idle too long — sign out for real (revokes the refresh token
    // server-side, not just a client-side redirect) and let whatever
    // page was requested render as signed-out. Protected pages then
    // redirect to /login themselves via requireSession().
    await supabase.auth.signOut();
    response.cookies.delete(LAST_ACTIVE_COOKIE);
    return response;
  }

  response.cookies.set(LAST_ACTIVE_COOKIE, String(now), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

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
