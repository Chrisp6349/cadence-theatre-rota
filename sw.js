// -----------------------------------------------------------------------
// sw.js
// Makes Cadence installable and usable with no/patchy signal (theatre
// corridors are exactly the kind of place that happens).
//
// Strategy: network-first, cache-fallback, for everything in the app
// shell (HTML/CSS/JS/icons). Online, you always get the latest deployed
// version — the cache is just a safety net for when the network request
// fails. Firestore's own requests (a different origin) are never
// intercepted here at all; they're handled by Firestore's own offline
// persistence, set up separately in firebase-init.js.
//
// Bump CACHE_VERSION whenever you change any cached file and want
// already-installed copies of the app to pick up the change — old
// caches are deleted automatically on the next load after that.
// -----------------------------------------------------------------------

const CACHE_VERSION = "v2";
const CACHE_NAME = `cadence-shell-${CACHE_VERSION}`;

const SHELL_FILES = [
  "./",
  "./index.html",
  "./dashboard.html",
  "./rota.html",
  "./calendar.html",
  "./staff.html",
  "./admin.html",
  "./account.html",
  "./css/cadence.css",
  "./js/admin.js",
  "./js/auth.js",
  "./js/department.js",
  "./js/firebase-config.js",
  "./js/firebase-init.js",
  "./js/insights.js",
  "./js/pwa.js",
  "./js/rota.js",
  "./js/shell.js",
  "./js/theme.js",
  "./js/users.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only handle our own same-origin GET requests. Everything else
  // (Firestore, Google Fonts, gstatic SDK imports, POST requests) passes
  // straight through untouched.
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        const copy = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return networkResponse;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./dashboard.html")))
  );
});
