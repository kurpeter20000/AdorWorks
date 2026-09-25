import rateLimit from "express-rate-limit";

/**
 * S14-05 threat-model gap: "backend/api has no rate-limiting middleware
 * anywhere" — every route here relied entirely on requireAuth/requireStaff
 * for protection, with no limit on how many requests an already-
 * authenticated (or anonymous, pre-auth-check) caller could fire.
 *
 * In-memory (express-rate-limit's default store), not table-backed like
 * platform/src/lib/domain/rateLimit.ts — deliberately different from
 * that one: this runs as a single Render instance, not Vercel's
 * multi-instance serverless model, so there's no cross-instance state
 * to lose, and avoiding a DB round-trip on every single request matters
 * here in a way it doesn't for the occasional login/signup attempt.
 *
 * One global limiter mounted before every route, rather than per-route
 * tuning — this directly closes the stated gap (an unauthenticated or
 * authenticated caller could hit any route without limit) without
 * guessing at per-endpoint numbers nobody has asked for yet. 300
 * requests / 15 minutes per IP is generous enough for the staff
 * console's normal dashboard polling while still bounding a scripted
 * flood.
 */
export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please wait a few minutes and try again." },
});
