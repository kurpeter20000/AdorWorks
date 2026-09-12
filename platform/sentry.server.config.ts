import * as Sentry from "@sentry/nextjs";

// S03-06 — server-side half of application error monitoring. Loaded by
// src/instrumentation.ts's register(), Next.js's own hook for this
// (not a Sentry-specific mechanism). See instrumentation-client.ts for
// why Session Replay is deliberately not enabled anywhere in this setup.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}
