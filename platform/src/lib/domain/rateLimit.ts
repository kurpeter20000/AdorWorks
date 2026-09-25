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

/**
 * Best-effort client IP — used for signup, where the meaningful
 * identifier is "one source creating many accounts," not any single
 * email.
 *
 * Ultra-review finding (2026-09-25, Medium): the plain `x-forwarded-for`
 * header is client-controlled unless the ingress in front of the app
 * is known to overwrite it, which is exactly the trust model this is
 * documenting rather than leaving implicit. This app runs on Vercel
 * (confirmed against Vercel's own docs, docs/headers/request-headers,
 * 2026-09-25): Vercel's edge overwrites `x-forwarded-for` with the
 * real client IP and does not forward externally-set values, UNLESS
 * the project has purchased the Enterprise "Trusted Proxy" add-on
 * (not the case here). `x-vercel-forwarded-for` is Vercel's own
 * explicitly-guaranteed equivalent — identical value, but documented
 * as staying correct even if a customer-controlled proxy is ever
 * added in front of Vercel, which plain `x-forwarded-for` is not
 * guaranteed to survive. Preferred here for that reason; falls back
 * to `x-forwarded-for` only for local dev, where neither header
 * reflects a real internet-facing client anyway.
 *
 * If this app is ever deployed somewhere other than Vercel, this
 * trust assumption needs re-validation before relying on it again —
 * that's the whole point of writing it down here instead of assuming
 * silently.
 */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const vercelForwardedFor = h.get("x-vercel-forwarded-for");
  if (vercelForwardedFor) return vercelForwardedFor.trim();

  // Local-dev-only fallback — takes the last entry (closest to this
  // process) rather than the first, since a standards-compliant proxy
  // chain appends its own hop rather than overwriting the client's.
  const forwardedFor = h.get("x-forwarded-for");
  const entries = forwardedFor?.split(",").map((s) => s.trim()).filter(Boolean);
  return entries?.at(-1) || "unknown";
}

/**
 * Records this attempt and reports whether it's within the allowed
 * rate. Always records — even a rejected attempt counts, so retrying
 * immediately after a rejection doesn't reset anything.
 *
 * Ultra-review finding (2026-09-25, High): the previous version did
 * count-then-insert as two separate round trips, with the insert not
 * even awaited before returning the decision — a genuine TOCTOU race.
 * Two concurrent requests for the same action+identifier (a burst of
 * parallel login/MFA-challenge attempts) could both read the same
 * pre-insert count and both be granted, defeating the limit for a
 * burst attack. The whole check-record-decide sequence now happens
 * inside one Postgres function (0090), serialized per action+identifier
 * via a transaction-scoped advisory lock. Verified live: 20 concurrent
 * calls against a maxAttempts=5 window now allow exactly 5, not more.
 */
export async function checkAndRecordAttempt(
  admin: SupabaseClient<Database>,
  action: RateLimitAction,
  identifier: string
): Promise<{ allowed: boolean }> {
  const { windowMinutes, maxAttempts } = WINDOWS[action];

  try {
    const { data: allowed, error } = await admin.rpc("check_rate_limit", {
      p_action: action,
      p_identifier: identifier,
      p_window_minutes: windowMinutes,
      p_max_attempts: maxAttempts,
    });
    if (error) throw error;

    return { allowed: allowed ?? true };
  } catch (err) {
    console.error(`rate limit check failed for ${action}/${identifier}, failing open:`, err);
    return { allowed: true };
  }
}
