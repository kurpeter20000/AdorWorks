import "server-only";
import crypto from "node:crypto";

/**
 * S11-08: the unsubscribe link in every email has to work for someone
 * who isn't signed in (that's the whole point of an email unsubscribe
 * link — it can't require logging in first). A signed HMAC token keyed
 * to the user id does that without a new table or a stored, guessable
 * token: anyone with the link can unsubscribe that one account and
 * nothing else, and the token can't be forged without this secret.
 *
 * Falls back to deriving from SUPABASE_SECRET_KEY if UNSUBSCRIBE_SECRET
 * isn't set, so this works out of the box in every existing environment
 * — but a dedicated secret is what production should actually set (see
 * .env.local.example), since rotating the Supabase key would otherwise
 * silently invalidate every unsubscribe link already sent.
 */
const SECRET = process.env.UNSUBSCRIBE_SECRET || process.env.SUPABASE_SECRET_KEY || "adorworks-unsubscribe-dev-fallback";

export function createUnsubscribeToken(userId: string): string {
  return crypto.createHmac("sha256", SECRET).update(userId).digest("hex");
}

export function verifyUnsubscribeToken(userId: string, token: string): boolean {
  const expected = createUnsubscribeToken(userId);
  const expectedBuf = Buffer.from(expected);
  const tokenBuf = Buffer.from(token || "");
  if (expectedBuf.length !== tokenBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, tokenBuf);
}

/** Every renderEmail() call site builds this the same way — one place to get it right. */
export function buildUnsubscribeUrl(userId: string): string {
  const token = createUnsubscribeToken(userId);
  const site = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${site}/unsubscribe?u=${encodeURIComponent(userId)}&t=${encodeURIComponent(token)}`;
}
