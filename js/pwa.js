// -----------------------------------------------------------------------
// pwa.js
// Registers the service worker (sw.js) so the app installs and keeps
// working with no signal. Called once per page load from every HTML
// file — browsers no-op a duplicate registration of the same worker,
// so there's no harm in it running on every page.
//
// Also actively pushes updates through, rather than waiting on the
// browser's own schedule for checking — iOS Safari in particular (both
// in-browser and as an installed home-screen app) is slow and
// inconsistent about surfacing a new service worker on its own, which is
// what "stuck on an old cached version" looks like from the outside.
// -----------------------------------------------------------------------

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  // Once a new service worker actually takes control, reload the page
  // once so the tab is running the new version straight away, instead of
  // silently sitting on stale cached content until the person happens to
  // close and reopen the app themselves.
  let reloadedAlready = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadedAlready) return;
    reloadedAlready = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .then((registration) => {
        // Ask immediately whether a newer sw.js exists on the server,
        // rather than waiting on the browser's own update timer. Per the
        // service worker spec this check bypasses normal HTTP caching for
        // the script itself, so it reliably sees a freshly deployed
        // version rather than a stale cached copy of sw.js.
        registration.update().catch(() => {});
      })
      .catch(() => {
        // Offline on first-ever visit, or served somewhere that doesn't
        // support service workers — the app still works, just without
        // the offline/installable extras.
      });
  });
}
