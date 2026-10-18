import * as Sentry from "@sentry/nextjs";

// S03-06 — edge-runtime half of application error monitoring (middleware
// and any edge-runtime routes). Loaded by src/instrumentation.ts's
// register(). See instrumentation-client.ts for why Session Replay is
// deliberately not enabled anywhere in this setup.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    // v11 replaced sendDefaultPii with per-category controls that default
    // to "collect everything" when omitted (opposite of v10's behavior) --
    // this app handles real personal and payment-adjacent data, so every
    // category that could carry PII stays off instead of silently
    // inheriting that permissive default.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      genAI: { inputs: false, outputs: false },
      stackFrameVariables: false,
    },
  });
}
