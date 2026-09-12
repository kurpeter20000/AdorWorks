import * as Sentry from "@sentry/nextjs";

// S03-06 — application error monitoring. Next.js loads this file
// automatically (framework-native hook, not a Sentry-injected one) —
// required for client-side init to work under Turbopack, which is the
// default bundler as of this app's Next.js version and doesn't run the
// older webpack-plugin-based auto-instrumentation.
//
// No DSN configured (local dev, CI, or before the founder's Sentry
// project exists for a given environment) -> this just no-ops, nothing
// is sent anywhere. Session Replay is deliberately NOT enabled — this
// app handles real personal and payment-adjacent data, and screen-replay
// recording is a meaningfully bigger privacy surface than error capture;
// revisit only as a deliberate, separate decision if ever needed.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
