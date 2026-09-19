import type * as SentryNS from "@sentry/nextjs";

// S03-06 — application error monitoring. Next.js loads this file
// automatically (framework-native hook, not a Sentry-injected one) —
// required for client-side init to work under Turbopack, which is the
// default bundler as of this app's Next.js version and doesn't run the
// older webpack-plugin-based auto-instrumentation.
//
// No DSN configured (local dev, CI, or before the founder's Sentry
// project exists for a given environment) -> this used to still ship the
// full SDK to the browser and just skip calling init() — a static
// `import * as Sentry` is evaluated at parse time regardless of the `if
// (dsn)` guard below it. Confirmed directly: that no-op cost every page
// a real ~120KB/1.7s chunk even with no DSN configured anywhere, exactly
// the situation in CI and local dev. A dynamic import makes the SDK its
// own chunk that's only ever fetched when a DSN is actually set — a true
// zero-byte no-op instead of a zero-effect one.
//
// Session Replay is deliberately NOT enabled — this app handles real
// personal and payment-adjacent data, and screen-replay recording is a
// meaningfully bigger privacy surface than error capture; revisit only
// as a deliberate, separate decision if ever needed.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

let sentryPromise: Promise<typeof SentryNS> | null = null;
function loadSentry() {
  if (!sentryPromise) sentryPromise = import("@sentry/nextjs");
  return sentryPromise;
}

if (dsn) {
  loadSentry().then((Sentry) => {
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
    });
  });
}

export const onRouterTransitionStart: typeof SentryNS.captureRouterTransitionStart = (...args) => {
  if (!dsn) return;
  loadSentry().then((Sentry) => Sentry.captureRouterTransitionStart(...args));
};
