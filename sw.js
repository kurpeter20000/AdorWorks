/*
  AdorWorks service worker — makes the site installable and usable on the
  slow/unreliable mobile connections common in South Sudan.

  Strategy:
  - Every page and the CSS/JS/icon shell are precached on install, so the
    whole site works offline once visited once (not just the homepage).
  - Navigations (HTML pages) go network-first, falling back to the cached
    copy, then to offline.html if neither is available — visitors always
    see their most recent data when online, and something useful when not.
  - Static assets (css/js/img/fonts) go cache-first with a background
    refresh (stale-while-revalidate), since they change rarely and a
    round trip to re-fetch them on every load wastes data.
  - Every non-GET request (form POSTs, future API calls) is left
    completely untouched — the service worker never intercepts writes.

  Bump CACHE_VERSION on every deploy that changes cached files, so
  visitors' installed copies pick up the update instead of serving stale
  content indefinitely.
*/
const CACHE_VERSION = "adorworks-v3";
const SHELL_CACHE = CACHE_VERSION + "-shell";
const RUNTIME_CACHE = CACHE_VERSION + "-runtime";

const SHELL_URLS = [
  "/",
  "/index.html",
  "/services.html",
  "/jobs-projects.html",
  "/for-employers.html",
  "/for-talent.html",
  "/how-it-works.html",
  "/trust-safety.html",
  "/pricing.html",
  "/impact-stories.html",
  "/about.html",
  "/insights.html",
  "/contact.html",
  "/offline.html",
  "/404.html",
  "/css/themes.css",
  "/css/styles.css",
  "/js/main.js",
  "/js/supabase-config.js",
  "/manifest.webmanifest",
  "/img/adorworks-mark.svg",
  "/img/adorworks-mark-reversed.svg",
  "/img/adorworks-logo-fullcolour.svg",
  "/img/adorworks-logo-reversed.svg",
  "/img/icons/icon-any-192.png",
  "/img/icons/icon-any-512.png",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function (cache) {
      return cache.addAll(SHELL_URLS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) { return key.indexOf(CACHE_VERSION) !== 0; })
          .map(function (key) { return caches.delete(key); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  var request = event.request;

  // Never touch non-GET requests (form submissions, future API writes).
  if (request.method !== "GET") return;

  // Never touch cross-origin requests (Netlify Forms endpoint, GTM, fonts
  // CDN, future API host) — only manage caching for same-origin site files.
  if (new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          var copy = response.clone();
          caches.open(SHELL_CACHE).then(function (cache) { cache.put(request, copy); });
          return response;
        })
        .catch(function () {
          return caches.match(request).then(function (cached) {
            return cached || caches.match("/offline.html");
          });
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(function (cached) {
      var network = fetch(request)
        .then(function (response) {
          if (response && response.status === 200) {
            var copy = response.clone();
            caches.open(RUNTIME_CACHE).then(function (cache) { cache.put(request, copy); });
          }
          return response;
        })
        .catch(function () { return cached; });
      return cached || network;
    })
  );
});
