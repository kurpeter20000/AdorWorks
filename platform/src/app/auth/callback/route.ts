import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { resolveSafeNextPath } from "@/lib/domain/redirects";
import { getMyOrganisationMembership } from "@/lib/dal/organisation";
import { EMPLOYER_ACCOUNT_ROLES } from "@/lib/domain/roles";
import type { Database } from "@/lib/database.types";

/**
 * Destination for Supabase's email-confirmation and password-reset
 * links (configured as emailRedirectTo in lib/actions/auth.ts).
 * Exchanges the one-time code for a real session, then continues
 * only to safe internal app routes.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const next = rawNext ? resolveSafeNextPath(rawNext) : await resolveDefaultNextPath(supabase);
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=confirmation_failed`);
}

/**
 * Only reached when the emailed link's own `next` didn't survive the
 * trip — see src/app/page.tsx's comment: Supabase falls back to the
 * bare Site URL when the exact redirectTo isn't in its Redirect URLs
 * allowlist, dropping every query param including next along with it.
 * A brand-new signup confirmation and a password-reset request both
 * produce an identical bare ?code= here, so this guesses the right
 * destination from the just-exchanged session instead of always
 * assuming password-reset: send someone still mid-setup to finish
 * setup, and only fall back to reset-password once their profile
 * already looks complete (the one thing an established user would
 * realistically be doing on this link).
 */
async function resolveDefaultNextPath(supabase: SupabaseClient<Database>): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "/dashboard";

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile) return "/dashboard";

  if (profile.role === "talent") {
    const { data: talentProfile } = await supabase
      .from("talent_profiles")
      .select("headline")
      .eq("id", user.id)
      .maybeSingle();
    if (!talentProfile || !talentProfile.headline) return "/onboarding";
  } else if ((EMPLOYER_ACCOUNT_ROLES as readonly string[]).includes(profile.role)) {
    const membership = await getMyOrganisationMembership();
    if (!membership) return "/organisation";
  }

  return "/reset-password";
}
