/* Cache persistente dos rankings no Neon.
   A tela de rankings é montada a partir da ESPN; sem esta tabela o cron não
   adiantaria nada, porque o cache em memória morre junto com a lambda. */

import { db } from "@/db";
import { rankingsCache } from "@/db/schema";
import { inArray } from "drizzle-orm";
import type { EntradaTime } from "./rankingsEngine";

/** Idade máxima aceita antes de preferir recalcular na hora. */
export const FRESCOR_CACHE_MS = 36 * 60 * 60 * 1000;

export type CacheRanking = {
  liga: string;
  times: EntradaTime[];
  atualizadoEm: Date;
  idadeMs: number;
};

const arr = (v: unknown): EntradaTime[] => (Array.isArray(v) ? (v as EntradaTime[]) : []);

/** Lê o cache de uma ou mais ligas. Nunca lança: sem banco, devolve vazio. */
export async function lerRankingsCache(ligas: string[]): Promise<Map<string, CacheRanking>> {
  const out = new Map<string, CacheRanking>();
  if (!ligas.length) return out;
  try {
    const linhas = await db
      .select()
      .from(rankingsCache)
      .where(inArray(rankingsCache.liga, ligas));
    for (const l of linhas) {
      const times = arr(l.payload);
      if (!times.length) continue; // linha vazia não serve: melhor recomputar
      const atualizadoEm = l.atualizadoEm instanceof Date ? l.atualizadoEm : new Date(String(l.atualizadoEm));
      out.set(l.liga, { liga: l.liga, times, atualizadoEm, idadeMs: Date.now() - atualizadoEm.getTime() });
    }
  } catch {
    /* cache é otimização: se o banco falhar, a tela calcula na hora */
  }
  return out;
}

/** Grava/atualiza a base de uma liga. Retorna false quando não deu (sem lançar). */
export async function gravarRankingsCache(liga: string, times: EntradaTime[]): Promise<boolean> {
  if (!times.length) return false;
  const jogos = times.reduce((n, t) => n + t.jogos.length, 0);
  try {
    await db
      .insert(rankingsCache)
      .values({ liga, times: times.length, jogos, payload: times, atualizadoEm: new Date() })
      .onConflictDoUpdate({
        target: rankingsCache.liga,
        set: { times: times.length, jogos, payload: times, atualizadoEm: new Date() },
      });
    return true;
  } catch {
    return false;
  }
}
