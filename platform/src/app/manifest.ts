import type { MetadataRoute } from "next";

// Same icon set as the public marketing site (../img/icons) — one brand
// identity across both. This app is the authenticated marketplace surface
// (dashboard, passport, contracts), so start_url goes straight to
// /dashboard rather than the marketing homepage.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AdorWorks — Talent found. Work delivered.",
    short_name: "AdorWorks",
    description: "Manage your AdorWorks profile, opportunities, and contracts.",
    id: "/dashboard",
    start_url: "/dashboard?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f4f7fb",
    theme_color: "#182230",
    lang: "en",
    dir: "ltr",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-any-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-any-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
