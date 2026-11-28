import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decrypt, encrypt } from "@/lib/encryption";

export const PROVIDERS = [
  { id: "espn", name: "ESPN", desc: "Gratuita, sem chave. Placares ao vivo, eventos, escalações, H2H, odds e líderes.", needsKey: false, doc: "https://site.api.espn.com" },
  { id: "footballdata", name: "Football-Data.org", desc: "Token gratuito. Competições, tabelas e artilheiros (goals/assistências/pênaltis).", needsKey: true, doc: "https://www.football-data.org/client/register" },
  { id: "sportmonks", name: "Sportmonks", desc: "xG, pressão, estatísticas avançadas de jogadores (planos pagos).", needsKey: true, doc: "https://my.sportmonks.com/api/tokens" },
  { id: "bzzoiro", name: "Bzzoiro Sports", desc: "Probabilidades e feeds complementares (fallback do Oracle).", needsKey: true, doc: "https://sports.bzzoiro.com/dashboard/" },
  { id: "api-football", name: "API-Football", desc: "Odds reais por partida (Casa/Empate/Fora). Plano free: 100 req/dia; fixtures podem exigir plano pago.", needsKey: true, doc: "https://dashboard.api-football.com/" },
  { id: "onesignal_rest", name: "OneSignal REST", desc: "Chave REST para disparar push do servidor (App ID já embutido).", needsKey: true, doc: "https://dashboard.onesignal.com" },
] as const;

const ENV_MAP: Record<string, string | undefined> = {
  footballdata: process.env.FOOTBALL_DATA_TOKEN,
  sportmonks: process.env.SPORTMONKS_TOKEN,
  bzzoiro: process.env.BZZOIRO_TOKEN,
  "api-football": process.env.API_FOOTBALL_KEY,
  onesignal_rest: process.env.ONESIGNAL_REST_API_KEY,
};

/**
 * SEGREDOS DE FORNECEDOR — CIFRADOS EM REPOUSO (AES-256-GCM).
 *
 * `setKey()` grava o token CIFRADO (`enc:v1:iv.tag.ciphertext`, ver
 * `lib/encryption.ts`); `getKey()` decifra antes de entregar ao fornecedor.
 * Antes a coluna `api_keys.token` guardava texto claro: qualquer dump, backup,
 * réplica de leitura ou credencial de banco vazada entregava Sportmonks,
 * Football-Data e a REST key do OneSignal. `maskKey()` sempre protegeu só a
 * TELA, nunca o banco.
 *
 * LEITURA TOLERANTE: valor sem o prefixo `enc:v1:` é texto claro legado e volta
 * como veio. É o que permite o deploy deste código acontecer ANTES da migração
 * (`npm run keys:encrypt`) sem derrubar nenhum fornecedor.
 *
 * Chamadas continuam funcionando se `ENCRYPTION_SECRET` sumir do ambiente: a
 * leitura do que já está cifrado falha (volta `""`) e o código cai para a env
 * do provedor (`ENV_MAP`), em vez de estourar a rota.
 *
 * TODO(segurança): rotacionar todas as chaves já gravadas — o histórico do git
 * e os dumps anteriores a esta cifragem devem ser considerados vazados.
 */

const mem = new Map<string, { at: number; v: string }>();

export async function getKey(provider: string): Promise<string> {
  const hit = mem.get(provider);
  if (hit && Date.now() - hit.at < 30000) return hit.v;
  let v = "";
  try {
    const rows = await db.select().from(apiKeys).where(eq(apiKeys.provider, provider)).limit(1);
    const gravado = rows[0]?.token || "";
    if (gravado) {
      /* `decrypt` devolve o texto claro legado quando não há prefixo e ""
         quando a cifra não abre (segredo ausente/trocado). Nesse caso seguimos
         para a env do provedor em vez de entregar lixo à API. */
      v = decrypt(gravado);
      if (!v) {
        console.error(
          `[keys] token de "${provider}" não pôde ser decifrado ` +
            `(ENCRYPTION_SECRET ausente ou trocada). Usando a env do provedor.`,
        );
      }
    }
  } catch {}
  if (!v) v = ENV_MAP[provider] || "";
  mem.set(provider, { at: Date.now(), v });
  return v;
}

export async function setKey(provider: string, token: string) {
  /* Cifra ANTES de tocar no banco. `encrypt("")` devolve "": limpar a chave
     continua sendo limpar (não grava ciphertext de nada). Se a
     `ENCRYPTION_SECRET` não existir, `encrypt` lança e NADA é gravado —
     falhar fechado é melhor que voltar a escrever texto claro. */
  const guardado = encrypt(token);
  await db.insert(apiKeys).values({ provider, token: guardado, updatedAt: new Date() })
    .onConflictDoUpdate({ target: apiKeys.provider, set: { token: guardado, updatedAt: new Date() } });
  mem.delete(provider);
}

export function maskKey(v: string) {
  if (!v) return "";
  if (v.length <= 8) return "••••";
  return v.slice(0, 4) + "••••••••" + v.slice(-4);
}