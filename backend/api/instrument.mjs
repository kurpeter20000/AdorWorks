import * as Sentry from "@sentry/node";

// S03-06 — application error monitoring. Loaded via `node --import` (see
// package.json's start/dev scripts) so Sentry's OpenTelemetry-based
// auto-instrumentation patches Express/http/pg etc. before those modules
// are first imported by server.js — required for it to actually
// instrument them, not just an ordering nicety.
//
// No DSN configured (local dev, CI, or before the Render env var is set)
// -> this just no-ops, nothing is sent anywhere.
const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}
