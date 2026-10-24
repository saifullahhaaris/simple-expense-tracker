const CACHE_NAME = "monetatracker-shell-v2";
const APP_FILES = [
  "./", "./index.html", "./signup.html", "./manifest.json", "./assets/moneta-icon.svg", "./dashboard.html", "./charts.html", "./notes.html", "./projects.html",
  "./css/style.css", "./js/supabase.js", "./js/utils.js", "./js/storage.js", "./js/offline.js",
  "./js/app.js", "./js/signup.js", "./js/dashboard.js", "./js/charts.js", "./js/notes.js", "./js/page-shell.js",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"
];
self.addEventListener("install", event => {
  event.waitUntil((async () => { const cache = await caches.open(CACHE_NAME); for (const url of APP_FILES) { try { await cache.add(url); } catch (error) { console.warn("Could not cache app resource", url, error); } } await self.skipWaiting(); })());
});
self.addEventListener("activate", event => { event.waitUntil((async () => { for (const key of await caches.keys()) if (key.startsWith("monetatracker-") && key !== CACHE_NAME) await caches.delete(key); await self.clients.claim(); })()); });
self.addEventListener("fetch", event => {
  const request = event.request; if (request.method !== "GET") return;
  event.respondWith((async () => {
    const cached = await caches.match(request); if (cached) return cached;
    try { const response = await fetch(request); if (response.ok && (new URL(request.url).origin === self.location.origin || request.url.includes("cdn.jsdelivr.net"))) { const cache = await caches.open(CACHE_NAME); cache.put(request, response.clone()).catch(() => {}); } return response; }
    catch (error) { if (request.mode === "navigate") { const fallback = await caches.match("./dashboard.html"); if (fallback) return fallback; } throw error; }
  })());
});
