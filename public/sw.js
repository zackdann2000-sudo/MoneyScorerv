/* GreenScore — Web Push nativo (VAPID) */
self.addEventListener("push", function (event) {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: "GreenScore", body: event.data ? event.data.text() : "" }; }
  const title = data.title || "⚽ GreenScore";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icon.png",
    badge: "/icon.png",
    data: { url: data.url || "/" },
    vibrate: [120, 60, 120],
    tag: data.tag || "greenscore",
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (const c of list) { if ("focus" in c) { c.navigate(url); return c.focus(); } }
    return clients.openWindow(url);
  }));
});
/* ------------------------------------------------------------------
 * Camada PWA: cache do shell para abrir offline.
 * Regra de ouro: HTML e dados SEMPRE da rede primeiro (odds não podem
 * ficar velhas); só o casco estático do Next é cache-first.
 * ------------------------------------------------------------------ */
const GS_CACHE = "gs-pwa-v1";
const GS_SHELL = ["/", "/manifest.json", "/icon-192x192.png", "/icon-512x512.png"];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(GS_CACHE)
      .then(function (c) { return c.addAll(GS_SHELL).catch(function () {}); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) { return k === GS_CACHE ? null : caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;      // API de terceiros: direto na rede
  if (url.pathname.startsWith("/api/")) return;         // dados nunca do cache

  // build do Next é imutável (hash no nome) -> cache-first
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) {
          const copy = res.clone();
          caches.open(GS_CACHE).then(function (c) { c.put(req, copy); });
          return res;
        });
      })
    );
    return;
  }

  // navegação/HTML -> rede primeiro, cache só como plano B offline
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          const copy = res.clone();
          caches.open(GS_CACHE).then(function (c) { c.put(req, copy); });
          return res;
        })
        .catch(function () {
          return caches.match(req).then(function (hit) { return hit || caches.match("/"); });
        })
    );
  }
});
