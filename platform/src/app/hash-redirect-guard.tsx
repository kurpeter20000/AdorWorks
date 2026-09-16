"use client";

import { useEffect } from "react";

/**
 * Same reasoning as this file's ?code= forwarding on the server side: if
 * the emailed link's exact redirectTo isn't in Supabase's Redirect URLs
 * allowlist, GoTrue falls back to the bare Site URL — but a URL fragment
 * (#access_token=...) is client-side only, so a Server Component can
 * never see or forward it the way it forwards a stray ?code=. This
 * catches that one remaining gap: a hash landing on the bare root gets
 * forwarded to /auth/callback, preserving it, so the real handler there
 * still gets a chance to sign the user in.
 */
export function HashRedirectGuard() {
  useEffect(() => {
    if (window.location.hash.includes("access_token")) {
      window.location.replace(`/auth/callback${window.location.hash}`);
    }
  }, []);

  return null;
}
