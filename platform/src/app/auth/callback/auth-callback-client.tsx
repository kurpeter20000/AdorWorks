"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { resolveSafeNextPath } from "@/lib/domain/redirects";
import { EMPLOYER_ACCOUNT_ROLES } from "@/lib/domain/roles";
import { StatePanel } from "@/components/state-panel";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Mirrors the old server-side resolveDefaultNextPath (auth/callback's
 * previous route.ts) for when the emailed link's own `next` didn't
 * survive the trip (Supabase drops every query param, next included,
 * when the exact redirectTo isn't in its Redirect URLs allowlist — see
 * src/app/page.tsx's comment). Guesses the right destination from the
 * now-established session instead of always assuming password-reset.
 */
async function resolveDefaultNextPath(supabase: SupabaseClient<Database>): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "/dashboard";

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile) return "/dashboard";

  if (profile.role === "talent") {
    const { data: talentProfile } = await supabase.from("talent_profiles").select("headline").eq("id", user.id).maybeSingle();
    if (!talentProfile || !talentProfile.headline) return "/onboarding";
  } else if ((EMPLOYER_ACCOUNT_ROLES as readonly string[]).includes(profile.role)) {
    const { data: membership } = await supabase.from("organisation_members").select("organisation_id").eq("user_id", user.id).maybeSingle();
    if (!membership) return "/organisation";
  }

  return "/reset-password";
}

export function AuthCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [failed, setFailed] = useState(false);
  const settled = useRef(false);
  // A stable client for this page's lifetime — created once via useState's
  // lazy initializer, not fresh per effect run. Necessary because of the
  // fix below: detectSessionInUrl is off here, and the effect does its
  // own one-time hash parsing, which must not race against a second
  // client instance (React's dev-mode double-effect-invocation) also
  // trying to parse (and clear) the same hash.
  const [supabase] = useState(() =>
    createBrowserClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { detectSessionInUrl: false },
    })
  );

  useEffect(() => {
    const rawNext = searchParams.get("next");

    async function proceed() {
      if (settled.current) return;
      settled.current = true;
      const next = rawNext ? resolveSafeNextPath(rawNext) : await resolveDefaultNextPath(supabase);
      router.replace(next);
    }

    async function run() {
      // Recovery, signup-confirmation and magic-link emails all deliver
      // the session as a URL fragment (#access_token=...&refresh_token=...)
      // — confirmed live against the real Supabase project, not the
      // ?code= (PKCE) style this route previously (and only) handled.
      // Parsed here directly, deterministically, instead of relying on
      // the SDK's own detectSessionInUrl — that auto-detection runs
      // inside the client constructor and clears the hash as a side
      // effect, which loses the tokens entirely the moment more than one
      // client instance exists (e.g. React's dev-mode double-effect-
      // invocation), since the second instance finds nothing left to
      // parse.
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (!error) {
          await proceed();
          return;
        }
      }

      // The ?code= (PKCE) path — not what this project's email links
      // actually use today, kept for anything that might in the future
      // (e.g. an OAuth provider).
      const code = searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          await proceed();
          return;
        }
      }

      if (!settled.current) setFailed(true);
    }

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (failed) router.replace("/login?error=confirmation_failed");
  }, [failed, router]);

  return (
    <main className="mx-auto max-w-md p-8">
      <StatePanel title="Signing you in" tone="info">
        One moment…
      </StatePanel>
    </main>
  );
}
