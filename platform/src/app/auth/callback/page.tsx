import { AuthCallbackClient } from "./auth-callback-client";

/**
 * Destination for Supabase's email-confirmation and password-reset links
 * (configured as emailRedirectTo/redirectTo in lib/actions/auth.ts).
 *
 * BUG FIX (2026-09-16): this used to be a server Route Handler that only
 * ever looked for a `?code=` query param (the PKCE flow). Confirmed live
 * against the real Supabase project (both admin.generateLink and an
 * actual resetPasswordForEmail call, hitting Supabase's own /auth/v1/verify
 * endpoint directly): every recovery and signup-confirmation link Supabase
 * actually sends redirects here with the session as a URL **fragment**
 * instead — `#access_token=...&refresh_token=...&type=recovery` — not a
 * query param. A server Route Handler can never see a URL fragment at all
 * (browsers strip it before the HTTP request is even sent), so `code` was
 * always null and every single reset/confirmation link silently failed,
 * landing on /login?error=confirmation_failed. This is why "a user can
 * receive a password reset link or magic link but cannot reset their
 * password" — the link genuinely never worked, for anyone, ever.
 *
 * Fixed by making this a page instead, so a Client Component can read
 * window.location.hash directly. The Supabase browser client's own
 * detectSessionInUrl (on by default in a browser) parses that hash
 * automatically and establishes a real session, which @supabase/ssr syncs
 * to cookies the server can then see. The `?code=` (PKCE) path is kept
 * too, client-side, for anything that does use it in the future (e.g. an
 * OAuth provider).
 */
export default function AuthCallbackPage() {
  return <AuthCallbackClient />;
}
