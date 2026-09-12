import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    // Portfolio images and any future avatar/logo uploads are served
    // from Supabase Storage's public-URL host — wildcarded by project
    // ref (not one hardcoded ref) so this works across every
    // environment (local/staging/prod) without editing config per env.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

// S03-06 — no SENTRY_AUTH_TOKEN is configured anywhere (Vercel/CI), so
// the source-map upload this plugin can do is skipped automatically —
// errors still report with unminified stack traces missing, which is an
// acceptable tradeoff for now rather than provisioning another Sentry
// credential just for this. `silent: true` keeps that skip from being
// noisy in every build log.
export default withSentryConfig(nextConfig, {
  silent: true,
  widenClientFileUpload: false,
  disableLogger: true,
});
