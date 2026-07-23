// -----------------------------------------------------------------------
// sw.js
// Makes Cadence installable and usable with no/patchy signal (theatre
// corridors are exactly the kind of place that happens).
//
// Strategy: network-first, cache-fallback, for the known app-shell files
// only (HTML/CSS/JS/icons/manifest/guide). Online, you always get the
// latest deployed version — the cache is just a safety net for when a
// request fails. Firestore's own requests (a different origin) are never
// intercepted here; they're handled by Firestore's own offline
// persistence, set up separately in firebase-init.js.
//
// Bump CACHE_VERSION whenever you change a cached file and want
// already-installed copies to pick it up — old caches are deleted
// automatically once the new one activates. pwa.js also forces an update
// check on every page load and reloads once a new version takes over, so
// this shouldn't need a manual "clear site data" to take effect.
// -----------------------------------------------------------------------

const CACHE_VERSION = "v6";
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
  "./js/messages.js",
  "./js/pwa.js",
  "./js/rota.js",
  "./js/shell.js",
  "./js/theme.js",
  "./js/users.js",
  "./manifest.webmanifest",
  "./Cadence-User-Guide.pdf",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

// Resolved against sw.js's own location (the repo root), not just the
// origin — matters because this site lives at a sub-path, not the domain
// root. Used below to recognise a shell file regardless of any query
// string a request might carry (e.g. dashboard.html?week=...&day=...).
const SHELL_PATHS = new Set(SHELL_FILES.map((f) => new URL(f, self.location.href).pathname));

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Cache each file independently. cache.addAll() is all-or-nothing —
      // one missing or mismatched file (a guide PDF not yet uploaded, an
      // icon with the wrong case, anything) used to fail the ENTIRE
      // install silently, permanently stranding devices on whatever
      // older, more broken service worker was already running. A failed
      // fetch here just means that one file isn't precached yet; it gets
      // cached opportunistically the first time it's actually requested
      // (see the fetch handler below), and everything else still works.
      Promise.all(SHELL_FILES.map((url) =>
        cache.add(url).catch((err) => console.warn("Cadence SW: couldn't precache", url, err))
      ))
    )
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
  const req = event.request;
  const url = new URL(req.url);

  // Only handle our own same-origin GET requests to known app-shell
  // files. Everything else (Firestore, Google Fonts, gstatic SDK
  // imports, any other same-origin request) passes straight through
  // untouched — deliberately not a catch-all, so the cache can't grow
  // without bound.
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (!SHELL_PATHS.has(url.pathname)) return;

  event.respondWith(
    fetch(req)
      .then((networkResponse) => {
        // Only persist the canonical (query-free) URL — a link like
        // dashboard.html?week=...&day=... is still handled (network-first,
        // same as everything else), it just isn't its own cache entry.
        // Offline, it falls back to the plain cached dashboard.html below.
        if (!url.search) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return networkResponse;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match("./dashboard.html")))
  );
});
