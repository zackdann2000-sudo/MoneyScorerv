import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { eq } from "drizzle-orm";

export const PROVIDERS = [
  { id: "espn", name: "ESPN", desc: "Gratuita, sem chave. Placares ao vivo, eventos, escalações, H2H, odds e líderes.", needsKey: false, doc: "https://site.api.espn.com" },
  { id: "footballdata", name: "Football-Data.org", desc: "Token gratuito. Competições, tabelas e artilheiros (goals/assistências/pênaltis).", needsKey: true, doc: "https://www.football-data.org/client/register" },
  { id: "sportmonks", name: "Sportmonks", desc: "xG, pressão, estatísticas avançadas de jogadores (planos pagos).", needsKey: true, doc: "https://my.sportmonks.com/api/tokens" },
  { id: "bzzoiro", name: "Bzzoiro Sports", desc: "Probabilidades e feeds complementares (fallback do Oracle).", needsKey: true, doc: "https://sports.bzzoiro.com/dashboard/" },
  { id: "onesignal_rest", name: "OneSignal REST", desc: "Chave REST para disparar push do servidor (App ID já embutido).", needsKey: true, doc: "https://dashboard.onesignal.com" },
] as const;

const ENV_MAP: Record<string, string | undefined> = {
  footballdata: process.env.FOOTBALL_DATA_TOKEN,
  sportmonks: process.env.SPORTMONKS_TOKEN,
  bzzoiro: process.env.BZZOIRO_TOKEN,
  onesignal_rest: process.env.ONESIGNAL_REST_API_KEY,
};

const mem = new Map<string, { at: number; v: string }>();

export async function getKey(provider: string): Promise<string> {
  const hit = mem.get(provider);
  if (hit && Date.now() - hit.at < 30000) return hit.v;
  let v = "";
  try {
    const rows = await db.select().from(apiKeys).where(eq(apiKeys.provider, provider)).limit(1);
    v = rows[0]?.token || "";
  } catch {}
  if (!v) v = ENV_MAP[provider] || "";
  mem.set(provider, { at: Date.now(), v });
  return v;
}

export async function setKey(provider: string, token: string) {
  await db.insert(apiKeys).values({ provider, token, updatedAt: new Date() })
    .onConflictDoUpdate({ target: apiKeys.provider, set: { token, updatedAt: new Date() } });
  mem.delete(provider);
}

export function maskKey(v: string) {
  if (!v) return "";
  if (v.length <= 8) return "••••";
  return v.slice(0, 4) + "••••••••" + v.slice(-4);
}