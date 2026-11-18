/**
 * Cache do NerdyTips no Neon.
 *
 * Cada página do site é baixada e reduzida para um resumo pequeno (~10-60 KB).
 * O resumo fica em `nerdytips_cache` por 15 min, igual ao resto do projeto.
 *
 * Regra: se o site cair, a rota responde com o último resumo bom marcado como
 * `stale` em vez de deixar a tela vazia. Se não houver nada, aí sim é erro.
 */
import { baixarHtml } from "./fonte";

export const CACHE_TTL_MS = 15 * 60 * 1000;

type Linha = { payload: unknown; updated_at: Date | string };

/** Cache de curto prazo por instância (evita bater no Neon a cada request). */
const mem = new Map<string, { dados: unknown; quando: number }>();

async function lerBanco<T>(chave: string): Promise<T | null> {
  const { db } = await import("@/db");
  const { nerdytipsCache } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");

  const rows = (await db.select().from(nerdytipsCache).where(eq(nerdytipsCache.cacheKey, chave)).limit(1)) as unknown as Linha[];
  return rows.length ? (rows[0].payload as T) : null;
}

async function gravarBanco(chave: string, payload: unknown): Promise<void> {
  const { db } = await import("@/db");
  const { nerdytipsCache } = await import("@/db/schema");

  await db
    .insert(nerdytipsCache)
    .values({ cacheKey: chave, payload: payload as never, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: nerdytipsCache.cacheKey,
      set: { payload: payload as never, updatedAt: new Date() },
    });
}

export type Resultado<T> = { dados: T; cache: "hit" | "miss" | "stale"; idadeMs: number };

/**
 * Lê do cache; se estiver vencido ou não existir, baixa a página, transforma
 * com `transformar` e grava. Falha de rede com cache antigo disponível devolve
 * o antigo (`stale`) — falha de rede sem cache vira erro.
 */
export async function comCache<T>(
  chave: string,
  caminho: string,
  transformar: (html: string) => T,
  ttl = CACHE_TTL_MS,
): Promise<Resultado<T>> {
  const agora = Date.now();
  const emMemoria = mem.get(chave);
  if (emMemoria && agora - emMemoria.quando < ttl) {
    return { dados: emMemoria.dados as T, cache: "hit", idadeMs: agora - emMemoria.quando };
  }

  let antigo: T | null = null;
  let idadeMs = 0;
  try {
    const bruto = await lerBanco<{ dados: T; salvadoEm: number }>(chave);
    if (bruto && typeof bruto.salvadoEm === "number") {
      antigo = bruto.dados;
      idadeMs = agora - bruto.salvadoEm;
      if (idadeMs < ttl) {
        mem.set(chave, { dados: antigo, quando: agora });
        return { dados: antigo, cache: "hit", idadeMs };
      }
    }
  } catch (e) {
    console.error("[nerdytips] cache indisponível:", e instanceof Error ? e.message : e);
  }

  try {
    const html = await baixarHtml(caminho);
    const dados = transformar(html);
    mem.set(chave, { dados, quando: agora });
    try {
      await gravarBanco(chave, { dados, salvadoEm: agora });
    } catch (e) {
      // Gravar é otimização: se o banco recusar, a resposta ainda vale.
      console.error("[nerdytips] não gravou cache:", e instanceof Error ? e.message : e);
    }
    return { dados, cache: "miss", idadeMs: 0 };
  } catch (e) {
    if (antigo) return { dados: antigo, cache: "stale", idadeMs };
    throw e;
  }
}
