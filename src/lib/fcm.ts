/**
 * Envio de push via Firebase Cloud Messaging (FCM) — API HTTP v1.
 *
 * Integração SÓ do lado do servidor (estrutura pronta, sem Service Worker).
 * Quando formos publicar o app, o front registra o token em
 * `POST /api/push/fcm-token` e o servidor passa a enviar por aqui.
 *
 * Auth: conta de serviço → JWT RS256 → access token do Google (cache até expirar).
 * Variáveis de ambiente (SERVIDOR — não são as NEXT_PUBLIC_* do front):
 *   FCM_PROJECT_ID        ex.: greenscore-xxxxx
 *   FCM_CLIENT_EMAIL      service account → service-account@greenscore.iam.gserviceaccount.com
 *   FCM_PRIVATE_KEY       PEM da service account (aceita \n literais, aspas do painel,
 *                         JSON inteiro da service account e base64)
 *
 * ATENÇÃO: as 8 variáveis `NEXT_PUBLIC_FIREBASE_*` configuram SÓ o cliente
 * (gerar o token no navegador). Elas NÃO ativam o envio no servidor — quem
 * ativa é o trio acima. Confundir os dois é o motivo clássico de
 * `fcmConfigurado: false` com o app "todo configurado".
 *
 * Use `GET /api/push/status` para ver exatamente qual nome está faltando.
 */
import crypto from "crypto";

const PROJECT_ID = (process.env.FCM_PROJECT_ID || "").trim();
const CLIENT_EMAIL = (process.env.FCM_CLIENT_EMAIL || "").trim();

/**
 * Normaliza a chave privada da service account.
 *
 * Cada painel guarda o PEM de um jeito (aspas, `\n` literais, uma linha só,
 * JSON completo); sem isso o envio falha com um erro de OpenSSL ilegível.
 */
function normalizarChavePrivada(bruta: string): string {
  let k = (bruta || "").trim();
  if (!k) return "";
  // 1) chave/meta colada com aspas pelo painel da Vercel
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1).trim();
  }
  // 2) JSON inteiro da service account em uma única variável
  if (k.startsWith("{")) {
    try {
      const j = JSON.parse(k) as { private_key?: string };
      if (typeof j?.private_key === "string") k = j.private_key;
    } catch {
      /* não é JSON: segue como PEM */
    }
  }
  // 3) base64 (comum em secret manager / cópia de CI)
  if (!k.includes("BEGIN") && /^[A-Za-z0-9+/=\r\n]+$/.test(k)) {
    try {
      const decodificada = Buffer.from(k, "base64").toString("utf8");
      if (decodificada.includes("BEGIN")) k = decodificada;
    } catch {
      /* não é base64: segue */
    }
  }
  // 4) `\n` literais → quebras reais (o caso mais frequente)
  return k.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").trim();
}

const PRIVATE_KEY = normalizarChavePrivada(process.env.FCM_PRIVATE_KEY || "");

/**
 * A chave realmente assina?
 *
 * Só checar `PRIVATE_KEY !== ""` marcava FCM como configurado com a chave
 * truncada/colada errada, e o erro só aparecia depois, no envio, como
 * "error:1E08010C:DECODER routines::unsupported". Um teste de assinatura no
 * boot custa ~1ms e devolve um diagnóstico verdadeiro.
 *
 * A chave NUNCA sai daqui: só o booleano é exportado.
 */
function chaveAssina(pem: string): boolean {
  if (!pem || !pem.includes("BEGIN") || !pem.includes("PRIVATE KEY")) return false;
  try {
    crypto.createSign("RSA-SHA256").update("gs-diagnostico").sign(pem);
    return true;
  } catch {
    return false;
  }
}

const CHAVE_OK = chaveAssina(PRIVATE_KEY);

/** true quando o FCM está configurado no ambiente (3 vars do servidor + chave válida). */
export const FCM_ENABLED = Boolean(PROJECT_ID && CLIENT_EMAIL && CHAVE_OK);

export type DiagnosticoFcm = {
  /** FCM pronto para enviar. */
  ativo: boolean;
  /** Nomes de variáveis ausentes ou inválidas no servidor (`FCM_*`). */
  faltando: string[];
  variaveis: {
    FCM_PROJECT_ID: boolean;
    FCM_CLIENT_EMAIL: boolean;
    FCM_PRIVATE_KEY: boolean;
  };
  /** A chave privada foi normalizada e assina de verdade. */
  chaveAssina: boolean;
  /** Formato detectado da chave (ajuda a diagnosticar colagem errada). */
  chaveFormato: "ausente" | "pem" | "desconhecido";
  chaveTamanho: number;
  projeto: string;
  /** E-mail da service account com o miolo mascarado. */
  clientEmail: string;
  ambiente: string;
  commit: string;
};

/** Diagnóstico do FCM sem vazar segredo (booleanos, tamanho e domínio). */
export function fcmDiagnostico(): DiagnosticoFcm {
  const faltando: string[] = [];
  if (!PROJECT_ID) faltando.push("FCM_PROJECT_ID");
  if (!CLIENT_EMAIL) faltando.push("FCM_CLIENT_EMAIL");
  if (!PRIVATE_KEY) faltando.push("FCM_PRIVATE_KEY");
  else if (!CHAVE_OK) faltando.push("FCM_PRIVATE_KEY (presente, mas não assina — valor truncado ou com aspas/escapes errados)");

  const email = CLIENT_EMAIL
    ? `${CLIENT_EMAIL.slice(0, 4)}…@${CLIENT_EMAIL.split("@")[1] || "?"}`
    : "";

  return {
    ativo: FCM_ENABLED,
    faltando,
    variaveis: {
      FCM_PROJECT_ID: Boolean(PROJECT_ID),
      FCM_CLIENT_EMAIL: Boolean(CLIENT_EMAIL),
      FCM_PRIVATE_KEY: Boolean(PRIVATE_KEY),
    },
    chaveAssina: CHAVE_OK,
    chaveFormato: !PRIVATE_KEY ? "ausente" : PRIVATE_KEY.includes("BEGIN") ? "pem" : "desconhecido",
    chaveTamanho: PRIVATE_KEY.length,
    projeto: PROJECT_ID,
    clientEmail: email,
    ambiente: process.env.VERCEL_ENV || process.env.NODE_ENV || "local",
    commit: (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7),
  };
}

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
    return {
      ok: false,
      enviados: 0,
      falhas: tokens.length,
      invalidos: [],
      erro: `FCM não configurado no ambiente. Faltando: ${fcmDiagnostico().faltando.join(", ") || "—"}.`,
    };
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