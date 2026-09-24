import "server-only";
import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * S04-05 — table-backed rate limiting for authentication endpoints
 * (migration 0063). Table-backed rather than in-memory because Vercel
 * can run multiple serverless instances — an in-memory counter
 * wouldn't actually limit anything across them.
 *
 * Fails OPEN on a database error (logs and allows the attempt) — a
 * rate-limit check that itself breaks login/signup for everyone would
 * be a worse outage than the abuse it's meant to prevent. Contrast with
 * logAuditEvent, which is fire-and-forget after the real action already
 * succeeded; this one gates the action, so its failure mode matters
 * more and is a deliberate choice, not an oversight.
 */
// S14-05 gap-check finding (2026-09-24): mfa_challenge/report/invitation
// were the confirmed rate-limiting gaps from Stage 14's security audit —
// mfa_challenge is the most severe (a staff account with a stolen
// password but no authenticator device could otherwise brute-force a
// 6-digit TOTP code with no limit at all), report guards against
// mass-reporting to harass a competitor or retaliate, invitation guards
// against invite spam while still allowing a real employer to batch-
// invite a large shortlist in one sitting.
export type RateLimitAction = "login" | "signup" | "password_reset_request" | "mfa_challenge" | "report" | "invitation";

const WINDOWS: Record<RateLimitAction, { windowMinutes: number; maxAttempts: number }> = {
  login: { windowMinutes: 15, maxAttempts: 5 },
  signup: { windowMinutes: 60, maxAttempts: 5 },
  password_reset_request: { windowMinutes: 15, maxAttempts: 3 },
  mfa_challenge: { windowMinutes: 15, maxAttempts: 5 },
  report: { windowMinutes: 60, maxAttempts: 10 },
  invitation: { windowMinutes: 60, maxAttempts: 50 },
};

/** Best-effort client IP from the standard proxy header Vercel/Render set — used for signup, where the meaningful identifier is "one source creating many accounts," not any single email. */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwardedFor = h.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || "unknown";
}

/**
 * Records this attempt and reports whether it's within the allowed
 * rate. Always records — even a rejected attempt counts, so retrying
 * immediately after a rejection doesn't reset anything.
 */
export async function checkAndRecordAttempt(
  admin: SupabaseClient<Database>,
  action: RateLimitAction,
  identifier: string
): Promise<{ allowed: boolean }> {
  const { windowMinutes, maxAttempts } = WINDOWS[action];
  const windowStart = new Date(Date.now() - windowMinutes * 60_000).toISOString();

  try {
    // Cleanup (rows strictly before the window) and the count (rows
    // inside the window) touch disjoint row sets, so they're safe to run
    // concurrently instead of two stacked round trips — every one of
    // these adds real latency on top of the login/reset call that
    // follows, and login/signup/password-reset were all paying for both
    // sequentially on every single attempt.
    const [, { count, error: countError }] = await Promise.all([
      admin
        .from("auth_rate_limit_attempts")
        .delete()
        .eq("action", action)
        .eq("identifier", identifier)
        .lt("created_at", windowStart),
      admin
        .from("auth_rate_limit_attempts")
        .select("*", { count: "exact", head: true })
        .eq("action", action)
        .eq("identifier", identifier)
        .gte("created_at", windowStart),
    ]);
    if (countError) throw countError;

    const allowed = (count ?? 0) < maxAttempts;

    // Recording this attempt is bookkeeping for future calls, not part of
    // this call's gating decision (already computed above) — same
    // fire-and-forget contract as logAuditEvent, so the caller isn't
    // held up for a third round trip.
    admin
      .from("auth_rate_limit_attempts")
      .insert({ action, identifier })
      .then(({ error }) => {
        if (error) console.error(`rate limit insert failed for ${action}/${identifier}:`, error.message);
      });

    return { allowed };
  } catch (err) {
    console.error(`rate limit check failed for ${action}/${identifier}, failing open:`, err);
    return { allowed: true };
  }
}
