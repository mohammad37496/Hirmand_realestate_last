const CACHE_NAME = "hirmand-shell-v7";
const APP_SHELL = ["/", "/properties", "/favorites", "/smart-search", "/nearby", "/manifest.webmanifest", "/__grok/manifest.webmanifest", "/pwa/icon-180.png", "/pwa/icon-192.png", "/pwa/icon-512.png", "/pwa/icon-maskable.svg", "/pwa/icon-monochrome.svg", "/pwa/shortcut-properties.svg", "/pwa/shortcut-favorites.svg", "/pwa/shortcut-nearby.svg", "/pwa/shortcut-search.svg"];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("message", (event) => { if (event.data?.type === "SKIP_WAITING") self.skipWaiting(); });
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname === "/sw.js" || url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) { const copy = response.clone(); void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)); }
      return response;
    }).catch(() => caches.match(request).then((cached) => cached || caches.match("/"))));
    return;
  }
  if (url.pathname.startsWith("/images/") || url.pathname.startsWith("/pwa/") || url.pathname === "/manifest.webmanifest" || url.pathname === "/__grok/manifest.webmanifest" || url.pathname.startsWith("/__grok/install/")) {
    event.respondWith(caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) { const copy = response.clone(); void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)); }
        return response;
      });
    }));
  }
});
