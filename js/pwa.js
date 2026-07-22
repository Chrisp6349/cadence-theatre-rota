// -----------------------------------------------------------------------
// pwa.js
// Registers the service worker (sw.js) so the app installs and keeps
// working with no signal. Called once per page load from every HTML
// file — browsers no-op a duplicate registration of the same worker,
// so there's no harm in it running on every page.
// -----------------------------------------------------------------------

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Offline on first-ever visit, or served somewhere that doesn't
      // support service workers — the app still works, just without
      // the offline/installable extras.
    });
  });
}
