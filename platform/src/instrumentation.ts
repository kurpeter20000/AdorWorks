import * as Sentry from "@sentry/nextjs";

// S03-06 — Next.js's own hook (not Sentry-specific) for registering
// runtime-specific setup. Loads the server or edge Sentry config
// depending on which runtime this process actually is.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
