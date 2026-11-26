/*
 * GreenScore — worker de PUSH NATIVO (Firebase Cloud Messaging).
 *
 * OBJETIVO: a notificação tem que aparecer na TELA DE BLOQUEIO do celular com o
 * app fechado. Para isso o push NÃO pode ser tratado pelo JS da página (nada de
 * toast/alert interno): quem desenha é este worker, via
 * `self.registration.showNotification()` — que entrega a notificação ao SISTEMA
 * OPERACIONAL (bandeja + tela de bloqueio), igual a um app nativo.
 *
 * POR QUE UM ARQUIVO SEPARADO DO `sw.js`:
 *   - `public/sw.js` já ocupa o scope "/" (PWA + OneSignal + cache). Dois workers
 *     no MESMO scope se anulam (o último registro assume e o outro morre) — foi
 *     exatamente esse bug que matou o "Instalar app" no Android antes.
 *   - Por isso este worker é registrado em
 *     scope "/firebase-cloud-messaging-push-scope" (scope padrão do FCM), sem
 *     disputar com o `sw.js`.
 *
 * CONFIGURAÇÃO: este arquivo é ESTÁTICO (public/), então não tem acesso a
 * `NEXT_PUBLIC_*` no build. O cliente (src/lib/firebaseClient.ts) registra o
 * worker passando a config do Firebase na query string:
 *   /firebase-messaging-sw.js?apiKey=...&projectId=...&messagingSenderId=...&appId=...
 * (apiKey do app web é pública por design — a mesma que vai no bundle.)
 */

const GS_FCM_SDK = "https://www.gstatic.com/firebasejs/11.6.1/";
const GS_ICONE_PADRAO = "/icon-192x192.png";
const GS_BADGE = "/icon-192x192.png";

/* ------------------------------ config ---------------------------------- */
function lerConfig() {
  let q = null;
  try {
    q = new URL(self.location.href).searchParams;
  } catch (e) {
    q = null;
  }
  const pega = (k) => (q && q.get(k)) || "";
  return {
    apiKey: pega("apiKey"),
    authDomain: pega("authDomain"),
    projectId: pega("projectId"),
    storageBucket: pega("storageBucket"),
    messagingSenderId: pega("messagingSenderId"),
    appId: pega("appId"),
    measurementId: pega("measurementId"),
  };
}

const GS_CONFIG = lerConfig();
const GS_CONFIG_OK = Boolean(GS_CONFIG.apiKey && GS_CONFIG.projectId && GS_CONFIG.messagingSenderId && GS_CONFIG.appId);

/* --------------------------- normalização --------------------------------
 * O FCM entrega o payload em duas formas possíveis:
 *   A) mensagem "notification" → { notification: { title, body, icon }, data: {...} }
 *   B) mensagem "data-only"    → { data: { title, body, ... } }
 * Aqui as duas viram o mesmo objeto antes de virar notificação de sistema.
 */
function normalizar(payload) {
  const p = payload || {};
  const n = p.notification || {};
  const d = p.data || {};
  const title = n.title || d.title || d.titulo || "⚽ GreenScore";
  const body = n.body || d.body || d.corpo || "";
  const icon = n.icon || d.icon || GS_ICONE_PADRAO;
  const url = d.url || d.link || (typeof n.click_action === "string" ? n.click_action : "") || "/";
  const tag = d.tag || d.matchId || "greenscore";
  return { title, body, icon, url, tag, data: d };
}

/* ------------------------- notificação de sistema ------------------------ */
function mostrarNotificacao(info) {
  const options = {
    body: info.body,
    icon: info.icon || GS_ICONE_PADRAO,
    badge: GS_BADGE,
    // `data` é o que o handler de clique lê depois (aba aberta / matchId).
    data: { url: info.url, gs: true, ...info.data },
    vibrate: [120, 60, 120],
    // tag fixa por jogo/evento: dois gols do mesmo jogo viram 2 notificações
    // (tag diferente), mas o mesmo evento repetido colapsa em uma só.
    tag: info.tag,
    renotify: true,
    requireInteraction: false,
    timestamp: Date.now(),
  };
  return self.registration.showNotification(info.title, options);
}

/* ----------------------------- SDK do FCM -------------------------------- */
let gsSdkPronto = false;

if (GS_CONFIG_OK) {
  try {
    importScripts(GS_FCM_SDK + "firebase-app-compat.js");
    importScripts(GS_FCM_SDK + "firebase-messaging-compat.js");
    /* eslint-disable no-undef */
    firebase.initializeApp(GS_CONFIG);
    const messaging = firebase.messaging();

    // Payload recebido com o app FECHADO / em background.
    messaging.onBackgroundMessage(function (payload) {
      return mostrarNotificacao(normalizar(payload));
    });
    gsSdkPronto = true;
  } catch (e) {
    // CDN bloqueado (adblock/rede corporativa): cai no handler cru abaixo.
    gsSdkPronto = false;
  }
}

/* ------------------- fallback: handler `push` cru -------------------------
 * Só é instalado quando o SDK não subiu — se os dois rodassem juntos, o mesmo
 * push viraria DUAS notificações (o SDK já escuta `push` internamente).
 */
if (!gsSdkPronto) {
  self.addEventListener("push", function (event) {
    let payload = {};
    try {
      payload = event.data ? event.data.json() : {};
    } catch (e) {
      payload = { data: { body: event.data ? event.data.text() : "" } };
    }
    event.waitUntil(mostrarNotificacao(normalizar(payload)));
  });
}

/* ------------------------- clique na notificação -------------------------
 * Abre a partida em uma aba já existente quando possível (sem duplicar abas).
 */
self.addEventListener("notificationclick", function (event) {
  const dados = (event.notification && event.notification.data) || {};
  event.notification.close();
  const url = dados.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (lista) {
      for (const c of lista) {
        if ("focus" in c) {
          if ("navigate" in c) c.navigate(url);
          return c.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

/* ------------------------- ciclo de vida do worker ------------------------ */
self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});
