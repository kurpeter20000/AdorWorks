"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyUnsubscribeToken } from "@/lib/unsubscribeToken";

/**
 * S11-08 — the unauthenticated path, reached from the unsubscribe link
 * in an email footer (see /unsubscribe/page.tsx). No session exists
 * here by definition, so this is verified by the signed token instead
 * (see unsubscribeToken.ts) and uses the admin client the same way
 * every other token-authenticated, no-session action in this codebase
 * does (e.g. the org-invite accept flow).
 *
 * Deliberately a POST-triggered server action, not a GET side effect on
 * the page itself — email-client link prescanning (Outlook Safe Links
 * and similar) fetches every link in an email automatically, which
 * would silently unsubscribe someone who never clicked anything if this
 * ran on page load.
 */
export async function unsubscribeByToken(userId: string, token: string): Promise<{ error?: string; success?: boolean }> {
  if (!userId || !token || !verifyUnsubscribeToken(userId, token)) {
    return { error: "This unsubscribe link is invalid." };
  }
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ email_notifications_enabled: false }).eq("id", userId);
  if (error) return { error: error.message };
  return { success: true };
}
