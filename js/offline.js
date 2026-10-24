// Registers the app-shell cache. Offline editing also requires the user to have signed in
// and loaded their records on this device at least once.
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(error => console.warn("Offline app shell could not be registered:", error)));
}
