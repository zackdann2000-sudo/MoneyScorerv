"use client";

/**
 * GreenScore — cliente FCM (Web Push nativo).
 *
 * O que este módulo faz:
 *   1. inicializa o Firebase com as variáveis `NEXT_PUBLIC_FIREBASE_*`;
 *   2. pede permissão de notificação (`Notification.requestPermission()`);
 *   3. registra o worker `public/firebase-messaging-sw.js` (scope próprio do FCM,
 *      sem brigar com o `sw.js` do PWA) e gera o token com a VAPID key;
 *   4. salva o token em `POST /api/push/fcm-token` (banco Neon).
 *
 * IMPORTANTE — por que o SDK é carregado por <script> e não por `import`:
 * o pacote npm `firebase` não faz parte das dependências do projeto (o build não
 * pode quebrar por causa disso). O SDK compat é carregado sob demanda do CDN do
 * Google, exatamente como o `sw.js` já faz com o SDK do OneSignal. Nada é
 * carregado até o usuário clicar no botão.
 */

/* ------------------------------- tipos ---------------------------------- */
export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId: string;
};

type MessagingCompat = {
  getToken(opts?: { vapidKey?: string; serviceWorkerRegistration?: ServiceWorkerRegistration }): Promise<string>;
  deleteToken(): Promise<boolean>;
  onMessage(handler: (payload: unknown) => void): () => void;
};

type FirebaseNamespace = {
  apps: unknown[];
  initializeApp(cfg: Record<string, string>): unknown;
  messaging(): MessagingCompat;
};

/** Status exposto para a UI (/config). */
export type PushStatus =
  | "idle" // nunca pediu
  | "unsupported" // navegador sem Service Worker/Push API (ex.: iOS < 16.4 fora do PWA)
  | "denied" // usuário/bloqueio do navegador negou
  | "pending" // pedindo permissão / gerando token
  | "granted" // token gerado e salvo no banco
  | "error"; // falhou (sem config, CDN bloqueado, rede)

export type ResultadoPush = {
  status: PushStatus;
  token?: string;
  /** true quando a rota /api/push/fcm-token confirmou a gravação. */
  salvo?: boolean;
  erro?: string;
};

/* ------------------------------ config ---------------------------------- */
function env(nome: string): string {
  // Acesso indireto: o Next só faz inline de `process.env.NEXT_PUBLIC_*` quando a
  // chave aparece literal no código; listamos todas abaixo, sem índice dinâmico.
  switch (nome) {
    case "NEXT_PUBLIC_FIREBASE_API_KEY":
      return process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "";
    case "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN":
      return process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "";
    case "NEXT_PUBLIC_FIREBASE_PROJECT_ID":
      return process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "";
    case "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET":
      return process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "";
    case "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID":
      return process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "";
    case "NEXT_PUBLIC_FIREBASE_APP_ID":
      return process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "";
    case "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID":
      return process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "";
    case "NEXT_PUBLIC_FIREBASE_VAPID_KEY":
      return process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || "";
    default:
      return "";
  }
}

/** Config pública do app web do Firebase (apiKey web é pública por design). */
export const firebaseConfig: FirebaseWebConfig = {
  apiKey: env("NEXT_PUBLIC_FIREBASE_API_KEY"),
  authDomain: env("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
  projectId: env("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
  storageBucket: env("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: env("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
  appId: env("NEXT_PUBLIC_FIREBASE_APP_ID"),
  measurementId: env("NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID"),
};

/**
 * Chave VAPID do par FCM ("Web Push certificates" no console do Firebase).
 * Aceita também `NEXT_PUBLIC_VAPID_PUBLIC_KEY` como plano B: é a MESMA chave que
 * o Web Push do servidor usa — se o FCM estiver apontado para ela, funciona.
 */
export const VAPID_KEY = env("NEXT_PUBLIC_FIREBASE_VAPID_KEY") || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

export const FCM_CONFIGURADO = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.messagingSenderId && firebaseConfig.appId && VAPID_KEY,
);

/** Scope dedicado: não colide com o `sw.js` (scope "/") do PWA/OneSignal. */
const SCOPE_FCM = "/firebase-cloud-messaging-push-scope";
const SW_FCM = "/firebase-messaging-sw.js";
const SDK_BASE = "https://www.gstatic.com/firebasejs/11.6.1/";
/** Marca local de que ESTE aparelho já tem token FCM gerado e salvo. */
const CHAVE_TOKEN = "gs_fcm_token";

/* --------------------------- carregamento do SDK ------------------------- */
let sdkPromise: Promise<FirebaseNamespace> | null = null;

function carregarScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existente = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existente) {
      if (existente.dataset.gsOk === "1") resolve();
      else existente.addEventListener("load", () => resolve(), { once: true });
      existente.addEventListener("error", () => reject(new Error(`Falha ao carregar ${src}`)), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.dataset.gsOk = "0";
    s.onload = () => {
      s.dataset.gsOk = "1";
      resolve();
    };
    s.onerror = () => reject(new Error(`Falha ao carregar ${src} (CDN bloqueado?)`));
    document.head.appendChild(s);
  });
}

/** Carrega firebase-app-compat + firebase-messaging-compat uma única vez. */
export async function carregarSdkFcm(): Promise<FirebaseNamespace> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = (async () => {
    await carregarScript(`${SDK_BASE}firebase-app-compat.js`);
    await carregarScript(`${SDK_BASE}firebase-messaging-compat.js`);
    const fb = (window as unknown as { firebase?: FirebaseNamespace }).firebase;
    if (!fb) throw new Error("SDK do Firebase não expôs `window.firebase`.");
    return fb;
  })().catch((e) => {
    sdkPromise = null; // permite tentar de novo no próximo clique
    throw e;
  });
  return sdkPromise;
}

/* ----------------------------- service worker ---------------------------- */
function urlWorkerFcm(cfg: FirebaseWebConfig): string {
  const q = new URLSearchParams({
    apiKey: cfg.apiKey,
    authDomain: cfg.authDomain,
    projectId: cfg.projectId,
    storageBucket: cfg.storageBucket,
    messagingSenderId: cfg.messagingSenderId,
    appId: cfg.appId,
    measurementId: cfg.measurementId,
  });
  return `${SW_FCM}?${q.toString()}`;
}

/**
 * Registra o worker do FCM no scope padrão do Firebase.
 *
 * Se o navegador recusar o scope aninhado (acontece quando já existe um worker
 * em "/"), seguimos com o registro que o próprio SDK cria — o `sw.js` também foi
 * ensinado a entender o payload do FCM, então a notificação não se perde.
 */
async function registrarWorkerFcm(cfg: FirebaseWebConfig): Promise<ServiceWorkerRegistration | undefined> {
  try {
    const reg = await navigator.serviceWorker.register(urlWorkerFcm(cfg), { scope: SCOPE_FCM });
    await navigator.serviceWorker.ready.catch(() => undefined);
    return reg;
  } catch {
    return undefined;
  }
}

/* ------------------------------- API pública ----------------------------- */

/** Permissão atual, sem pedir nada. */
export function statusPermissao(): PushStatus {
  if (typeof window === "undefined" || typeof Notification === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "idle";
  // Permissão dada NÃO garante token: só mostra "ativado" se um token já foi
  // gerado neste aparelho (o FCM pode ter rotacionado/invalidado o anterior).
  try {
    return localStorage.getItem(CHAVE_TOKEN) ? "granted" : "idle";
  } catch {
    return "granted";
  }
}

/**
 * Pede permissão + gera o token FCM + salva no banco.
 *
 * Deve ser chamada SEMPRE a partir de um clique (gesto do usuário) — pedir
 * permissão automaticamente faz o Chrome bloquear o prompt.
 */
export async function requestNotificationPermissionAndToken(): Promise<ResultadoPush> {
  if (typeof window === "undefined") return { status: "error", erro: "Sem window." };
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") {
    return { status: "unsupported", erro: "Este navegador não suporta notificações push. No iPhone, instale o app na tela de início." };
  }
  if (!FCM_CONFIGURADO) {
    return { status: "error", erro: "FCM não configurado: faltam NEXT_PUBLIC_FIREBASE_* (ou a VAPID key)." };
  }

  // 1) permissão
  let perm: NotificationPermission;
  try {
    perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  } catch (e) {
    return { status: "error", erro: `Permissão não pôde ser pedida: ${String((e as Error)?.message || e)}` };
  }
  if (perm !== "granted") {
    return { status: perm === "denied" ? "denied" : "idle", erro: "Permissão de notificação não concedida." };
  }

  // 2) SDK + worker + token
  try {
    const fb = await carregarSdkFcm();
    if (!fb.apps.length) fb.initializeApp(firebaseConfig as unknown as Record<string, string>);
    const messaging = fb.messaging();
    const reg = await registrarWorkerFcm(firebaseConfig);
    const token = await messaging.getToken({ vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });

    if (!token) {
      return { status: "error", erro: "O FCM não devolveu token (verifique a VAPID key no console do Firebase)." };
    }

    // 3) salva no banco (Neon) via rota própria
    try {
      const r = await fetch("/api/push/fcm-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, platform: "web" }),
      });
      if (r.ok) {
        try {
          localStorage.setItem(CHAVE_TOKEN, token);
        } catch {
          /* modo privado sem storage: segue sem a marca */
        }
      }
      return { status: "granted", token, salvo: r.ok, erro: r.ok ? undefined : `Token gerado, mas não salvo (HTTP ${r.status}).` };
    } catch (e) {
      return { status: "granted", token, salvo: false, erro: `Token gerado, mas a rota de registro falhou: ${String((e as Error)?.message || e)}` };
    }
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    // Erros clássicos: VAPID inválida, SDK bloqueado, HTTP local sem HTTPS.
    return { status: "error", erro: msg.slice(0, 220) };
  }
}

/** Remove o token do aparelho (não mexe no banco: o cron limpa inválidos). */
export async function revogarTokenFcm(): Promise<boolean> {
  try {
    const fb = await carregarSdkFcm();
    if (!fb.apps.length) return false;
    const ok = await fb.messaging().deleteToken();
    try {
      localStorage.removeItem(CHAVE_TOKEN);
    } catch {
      /* sem storage */
    }
    return ok;
  } catch {
    return false;
  }
}

/**
 * Notificação recebida com a aba ABERTA (o worker não desenha nada nesse caso).
 * A config do servidor manda `notification`, então isso só dispara para
 * mensagens data-only — usado para mostrar o toast interno do app.
 */
export async function escutarFcmEmPrimeiroPlano(handler: (info: { title: string; body: string; data: Record<string, string> }) => void): Promise<() => void> {
  try {
    const fb = await carregarSdkFcm();
    if (!fb.apps.length) fb.initializeApp(firebaseConfig as unknown as Record<string, string>);
    return fb.messaging().onMessage((payload) => {
      const p = payload as { notification?: { title?: string; body?: string }; data?: Record<string, string> };
      handler({
        title: p.notification?.title || p.data?.title || "⚽ GreenScore",
        body: p.notification?.body || p.data?.body || "",
        data: p.data || {},
      });
    });
  } catch {
    return () => undefined;
  }
}
