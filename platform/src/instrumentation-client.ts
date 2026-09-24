// S03-06 — application error monitoring. Next.js loads this file
// automatically (framework-native hook, not a Sentry-injected one) —
// required for client-side init to work under Turbopack, which is the
// default bundler as of this app's Next.js version and doesn't run the
// older webpack-plugin-based auto-instrumentation.
//
// No DSN configured (local dev, CI, or before the founder's Sentry
// project exists for a given environment) -> nothing is sent anywhere.
// Session Replay is deliberately NOT enabled — this app handles real
// personal and payment-adjacent data, and screen-replay recording is a
// meaningfully bigger privacy surface than error capture; revisit only
// as a deliberate, separate decision if ever needed.
//
// S12-12 gap-check finding (2026-09-24): `@sentry/nextjs`'s browser
// bundle is ~120KB and took over 1.3s to parse/execute under Lighthouse
// CI's mobile CPU throttling — a static `import * as Sentry` pulled the
// whole SDK into every page's bundle even when `dsn` is unset (i.e.
// every CI run, every local dev session, and any deployed environment
// before a Sentry project exists), which was most of what pushed
// /login and /signup's LCP past the 2500ms budget (its script
// evaluation delayed the page's largest text paint). Dynamic import
// means the SDK is only fetched and parsed when there's an actual DSN
// to send to.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  import("@sentry/nextjs").then(({ init }) => {
    init({ dsn, tracesSampleRate: 0.1, sendDefaultPii: false });
  });
}

export function onRouterTransitionStart(href: string, navigationType: string) {
  if (!dsn) return;
  void import("@sentry/nextjs").then(({ captureRouterTransitionStart }) => {
    captureRouterTransitionStart(href, navigationType);
  });
}
