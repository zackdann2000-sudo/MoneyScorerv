/*
 * GreenScore — service worker único do site.
 *
 * Por que um arquivo só: o Chrome Android só oferece "Instalar app" quando o
 * worker que CONTROLA a página tem um handler de `fetch`. Até aqui existiam
 * dois workers disputando o scope "/" — este, e o do OneSignal
 * (`TwoSignalSDKWorker.js`), que não tem `fetch`. Quando o OneSignal ganhava a
 * disputa (ele registra depois da hidratação), o app deixava de ser instalável
 * e o Chrome só oferecia "Criar atalho". Agora o OneSignal roda DENTRO deste
 * arquivo via importScripts, então existe um único worker no scope raiz:
 * push do OneSignal + push nativo VAPID + cache offline.
 */
importScripts("https://frosty-disk-8a68.moneyiosates.workers.dev/sdks/web/v16/OneSignalSDK.sw.js");

/* --------------------------- PUSH NATIVO (VAPID) ---------------------------
 * O OneSignal já desenha as notificações dele. Se o payload é do OneSignal,
 * saímos do caminho para não duplicar a notificação na tela.
 */
self.addEventListener("push", function (event) {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "GreenScore", body: event.data ? event.data.text() : "" };
  }
  // payload do OneSignal (custom.i / _osp) -> quem mostra é o SDK deles
  if (data && (data.custom || data._osp || data["google.c.a"])) return;

  const title = data.title || "⚽ GreenScore";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icon-192x192.png",
    badge: "/icon-192x192.png",
    data: { url: data.url || "/" },
    vibrate: [120, 60, 120],
    tag: data.tag || "greenscore",
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  // só trata as notificações criadas aqui em cima (tag + data.url próprios)
  const dados = event.notification && event.notification.data;
  if (!dados || !dados.url || event.notification.tag !== "greenscore") return;

  event.notification.close();
  const url = dados.url;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

/* ------------------------------- CAMADA PWA --------------------------------
 * HTML e dados SEMPRE da rede primeiro (odd velha é pior que erro);
 * só o build estático do Next (nome com hash) é cache-first.
 */
const GS_CACHE = "gs-pwa-v2";
const GS_SHELL = ["/", "/manifest.json", "/icon-192x192.png", "/icon-512x512.png"];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches
      .open(GS_CACHE)
      .then(function (c) {
        return c.addAll(GS_SHELL).catch(function () {});
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) { return k === GS_CACHE ? null : caches.delete(k); }));
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener("fetch", function (event) {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API de terceiros: direto na rede
  if (url.pathname.startsWith("/api/")) return; // dados nunca do cache

  // build do Next é imutável (hash no nome) -> cache-first
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then(function (hit) {
        return (
          hit ||
          fetch(req).then(function (res) {
            const copy = res.clone();
            caches.open(GS_CACHE).then(function (c) {
              c.put(req, copy);
            });
            return res;
          })
        );
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
          caches.open(GS_CACHE).then(function (c) {
            c.put(req, copy);
          });
          return res;
        })
        .catch(function () {
          return caches.match(req).then(function (hit) {
            return hit || caches.match("/");
          });
        })
    );
  }
});
