import type { NextConfig } from "next";

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

export default nextConfig;
