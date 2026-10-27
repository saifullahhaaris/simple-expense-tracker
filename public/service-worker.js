// MonetaTracker app-shell cache.
// - Navigations: network first, fall back to the cached shell (so the app opens offline).
// - Built assets (/assets/*, content-hashed): cache first.
// - Supabase and other cross-origin requests are never touched.
// On activation every older cache (including the previous HTML version's) is removed.
const CACHE = "monetatracker-app-v6";

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try { await cache.add("/index.html"); } catch (e) { /* offline during install is fine */ }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) (await caches.open(CACHE)).put("/index.html", response.clone()).catch(() => {});
        return response;
      } catch (error) {
        return (await caches.match("/index.html")) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) (await caches.open(CACHE)).put(request, response.clone()).catch(() => {});
      return response;
    })());
  }
});
