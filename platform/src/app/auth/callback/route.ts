import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveSafeNextPath } from "@/lib/domain/redirects";

/**
 * Destination for Supabase's email-confirmation and password-reset
 * links (configured as emailRedirectTo in lib/actions/auth.ts).
 * Exchanges the one-time code for a real session, then continues
 * only to safe internal app routes.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = resolveSafeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=confirmation_failed`);
}
