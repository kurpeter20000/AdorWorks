import { randomUUID } from "node:crypto";

/**
 * Assigns a correlation ID to every request (reusing one the client/proxy
 * already sent via X-Request-Id, so a request can be traced end-to-end
 * across Vercel -> this API -> Supabase logs rather than getting a new ID
 * at each hop) and logs one structured JSON line per request on completion
 * (S03-08). Replaces the previous raw console.log/error-only visibility —
 * there's no external log aggregator wired up yet (S03-06/S03-07 are
 * founder decisions), so this is deliberately still stdout, just
 * structured and correlatable instead of free-text.
 */
export function requestLog(req, res, next) {
  const requestId = req.headers["x-request-id"] || randomUUID();
  req.id = requestId;
  res.setHeader("X-Request-Id", requestId);

  const startedAt = Date.now();
  res.on("finish", () => {
    console.log(
      JSON.stringify({
        level: res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
        requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
        userId: req.user?.id ?? null,
      })
    );
  });

  next();
}
