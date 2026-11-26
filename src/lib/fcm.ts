/**
 * Envio de push via Firebase Cloud Messaging (FCM) — API HTTP v1.
 *
 * Integração SÓ do lado do servidor (estrutura pronta, sem Service Worker).
 * Quando formos publicar o app, o front registra o token em
 * `POST /api/push/fcm-token` e o servidor passa a enviar por aqui.
 *
 * Auth: conta de serviço → JWT RS256 → access token do Google (cache até expirar).
 * Variáveis de ambiente:
 *   FCM_PROJECT_ID        ex.: greenscore-xxxxx
 *   FCM_CLIENT_EMAIL      service account → service-account@greenscore.iam.gserviceaccount.com
 *   FCM_PRIVATE_KEY       PEM da service account (com \n literais é aceito)
 */
import crypto from "crypto";

const PROJECT_ID = process.env.FCM_PROJECT_ID || "";
const CLIENT_EMAIL = process.env.FCM_CLIENT_EMAIL || "";
const PRIVATE_KEY = (process.env.FCM_PRIVATE_KEY || "").replace(/\\n/g, "\n");

/** true quando o FCM está configurado no ambiente. */
export const FCM_ENABLED = Boolean(PROJECT_ID && CLIENT_EMAIL && PRIVATE_KEY);

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FCM_URL = (project: string) => `https://fcm.googleapis.com/v1/projects/${project}/messages:send`;

let cachedToken: { token: string; exp: number } | null = null;

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** JWT RS256 assinado com a chave privada da service account. */
function signJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: CLIENT_EMAIL,
    scope: FCM_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const enc = (o: object) => b64url(Buffer.from(JSON.stringify(o)));
  const unsigned = `${enc(header)}.${enc(claim)}`;
  const sig = crypto.createSign("RSA-SHA256").update(unsigned).sign(PRIVATE_KEY);
  return `${unsigned}.${b64url(sig)}`;
}

/** Access token do Google com cache (1h). Lança se FCM não configurado. */
async function accessToken(): Promise<string> {
  if (!FCM_ENABLED) throw new Error("FCM não configurado (FCM_PROJECT_ID/FCM_CLIENT_EMAIL/FCM_PRIVATE_KEY).");
  if (cachedToken && cachedToken.exp > Date.now() / 1000 + 60) return cachedToken.token;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signJwt(),
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`FCM token exchange falhou HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  const j = await res.json();
  cachedToken = { token: String(j.access_token), exp: Date.now() / 1000 + Number(j.expires_in || 3600) };
  return cachedToken.token;
}

export type MensagemPush = {
  title: string;
  body: string;
  /** dados adicionais (ex.: { matchId, mercado }) enviados no payload. */
  data?: Record<string, string>;
  /** ícone exibido na tela de bloqueio (padrão: /icon-192x192.png). */
  icon?: string;
  /** URL aberta no clique (só links absolutos viram `fcm_options.link`). */
  url?: string;
  /** agrupa/colapsa notificações do mesmo evento no sistema operacional. */
  tag?: string;
};

/** Ícone do app usado nas notificações nativas (bandeja + tela de bloqueio). */
export const ICONE_NOTIFICACAO = "/icon-192x192.png";

export type ResultadoFcm = {
  ok: boolean;
  enviados: number;
  falhas: number;
  invalidos: string[];
  erro?: string;
};

/**
 * Envia a mesma mensagem para vários tokens (mensagem por token, como a v1 exige).
 * Tokens que a FCM reporta como inválidos/desregistrados são devolvidos em
 * `invalidos` para o chamador limpar a tabela.
 */
export async function sendFcmToTokens(tokens: string[], msg: MensagemPush): Promise<ResultadoFcm> {
  if (!tokens.length) return { ok: true, enviados: 0, falhas: 0, invalidos: [] };
  if (!FCM_ENABLED) {
    return { ok: false, enviados: 0, falhas: tokens.length, invalidos: [], erro: "FCM não configurado no ambiente." };
  }
  const token = await accessToken();
  const unicos = [...new Set(tokens)];
  let enviados = 0, falhas = 0;
  const invalidos: string[] = [];

  const chunks: string[][] = [];
  for (let i = 0; i < unicos.length; i += 20) chunks.push(unicos.slice(i, i + 20));

  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(async (t) => {
        const icone = msg.icon || ICONE_NOTIFICACAO;
        const linkAbsoluto = msg.url && /^https?:\/\//i.test(msg.url) ? msg.url : undefined;
        /**
         * Formato NATIVO: `notification` é o que o SISTEMA OPERACIONAL desenha
         * (bandeja + tela de bloqueio, com o app fechado). `webpush.notification`
         * completa o visual no Chrome/Firefox; `data` carrega o que o clique
         * precisa (`matchId`, `url`). Mensagem data-only NÃO aparece sozinha —
         * por isso `notification` é sempre obrigatório aqui.
         */
        const payload = {
          message: {
            token: t,
            notification: { title: msg.title, body: msg.body },
            data: msg.data ?? {},
            webpush: {
              notification: {
                title: msg.title,
                body: msg.body,
                icon: icone,
                badge: icone,
                tag: msg.tag || msg.data?.matchId || "greenscore",
                renotify: true,
                vibrate: [120, 60, 120],
                click_action: msg.url || "/",
              },
              ...(linkAbsoluto ? { fcm_options: { link: linkAbsoluto } } : {}),
            },
            android: {
              priority: "HIGH",
              notification: { channelId: "value-alerts", icon: "stock_ticker_update", tag: msg.tag || "greenscore" },
            },
            apns: { payload: { aps: { sound: "default", "interruption-level": "time-sensitive" } } },
          },
        };
        const res = await fetch(FCM_URL(PROJECT_ID), {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          enviados++;
          return;
        }
        const corpo = await res.text().catch(() => "");
        falhas++;
        if (/UNREGISTERED|NOT_FOUND|INVALID_ARGUMENT/.test(corpo)) invalidos.push(t);
      }),
    );
  }

  return { ok: falhas === 0, enviados, falhas, invalidos };
}