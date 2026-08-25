/*
  AdorWorks platform app — minimal service worker.

  This app is deliberately online-only, not offline-first (see
  ConnectivityBanner's comment): every core action needs the server to mean
  anything, so caching pages/dashboards for offline use would just let
  people fill out forms that fail later. This worker exists only to (a)
  satisfy "installable" criteria so the app can be added to the home
  screen/app list, and (b) cut repeat downloads of immutable static assets
  (hashed Next.js build files, icons) for the low-data mobile connections
  this product targets.

  It never caches a page, a Server Action, or any Supabase/API response —
  only same-origin /_next/static/*, /icons/*, and the manifest.
*/
const CACHE_VERSION = "adorworks-platform-v1";
const STATIC_CACHE = CACHE_VERSION + "-static";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isCacheableStaticAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/icons/") ||
      url.pathname === "/manifest.webmanifest")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // never intercept Server Actions/writes
  const url = new URL(request.url);
  if (!isCacheableStaticAsset(url)) return; // everything else: untouched, straight to network

  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const networkFetch = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
