/**
 * Armazenamento do resumo do apitou no Neon.
 *
 * Por que o banco e não memória: o `/dados.js` tem 22 MB e a Vercel não mantém
 * memória entre invocações. O job grava o resumo (≈280 KB); as telas leem do
 * banco. Memória existe apenas como cache de leitura de curto prazo para não
 * bater no Neon em cada request.
 *
 * TTL: 15 min, igual ao resto do projeto. Se o resumo estiver mais velho que
 * isso, a rota responde com o que tem e sinaliza `stale` — nunca deixa a tela
 * vazia por causa de uma sincronização lenta.
 */
import { sincronizar, type ResumoJogo } from "./fonte";

export const CACHE_TTL_MS = 15 * 60 * 1000;
const CHAVE = "semana-v2"; // v2: payload ganhou a série dos últimos 10 jogos

export type ResumoGravado = {
  geradoEm: string;
  fonte: string;
  salvadoEm: number;
  jogos: ResumoJogo[];
  avisos: string[];
};

type CacheRow = { payload: ResumoGravado; updated_at: Date | string };

/** Cache em memória do processo (por instância serverless). */
let mem: { dados: ResumoGravado; quando: number } | null = null;

/** Lê o resumo gravado. Retorna null se ainda não houve sincronização. */
export async function lerResumo(): Promise<ResumoGravado | null> {
  if (mem && Date.now() - mem.quando < CACHE_TTL_MS) return mem.dados;

  try {
    const { db } = await import("@/db");
    const { apitouCache } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");

    const rows = (await db
      .select()
      .from(apitouCache)
      .where(eq(apitouCache.cacheKey, CHAVE))
      .limit(1)) as unknown as CacheRow[];

    if (!rows.length) return null;
    const dados = rows[0].payload;
    mem = { dados, quando: Date.now() };
    return dados;
  } catch (e) {
    console.error("[apitou] falha ao ler resumo do banco:", e instanceof Error ? e.message : e);
    // Banco indisponível: devolve o que estiver em memória, mesmo vencido.
    return mem?.dados ?? null;
  }
}

/** Idade do resumo em ms, ou Infinity se não houver. */
export async function idadeResumo(): Promise<number> {
  const r = await lerResumo();
  if (!r) return Infinity;
  return Date.now() - r.salvadoEm;
}

/**
 * Baixa as fontes, reduz e grava. É a operação CARA (baixa 22 MB) — só roda no
 * job protegido ou no primeiro acesso, nunca em paralelo por request.
 *
 * Uma trava em memória evita que dois requests disparem a sincronização ao
 * mesmo tempo na mesma instância.
 */
let sincronizando: Promise<ResumoGravado> | null = null;

export async function sincronizarEGravar(): Promise<ResumoGravado> {
  if (sincronizando) return sincronizando;

  sincronizando = (async () => {
    const t0 = Date.now();
    const res = await sincronizar();

    const gravado: ResumoGravado = {
      geradoEm: res.geradoEm,
      fonte: res.fonte,
      salvadoEm: Date.now(),
      jogos: res.jogos,
      avisos: res.avisos,
    };

    const { db } = await import("@/db");
    const { apitouCache } = await import("@/db/schema");

    await db
      .insert(apitouCache)
      .values({
        cacheKey: CHAVE,
        kind: "semana",
        geradoEm: res.geradoEm,
        payload: gravado as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: apitouCache.cacheKey,
        set: {
          geradoEm: res.geradoEm,
          payload: gravado as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        },
      });

    mem = { dados: gravado, quando: Date.now() };
    console.log(
      `[apitou] sincronizado em ${Date.now() - t0}ms: ${res.jogos.length} jogos, ${res.avisos.length} avisos`,
    );
    return gravado;
  })().finally(() => {
    sincronizando = null;
  });

  return sincronizando;
}

/**
 * Garante dados frescos para a tela.
 *
 * - Se tem resumo válido: devolve na hora.
 * - Se está vencido: devolve o vencido e dispara a atualização em background
 *   (stale-while-revalidate) — a tela nunca espera 3 s de download.
 * - Se não tem nada: precisa baixar de forma síncrona, senão não há o que mostrar.
 */
export async function garantirResumo(): Promise<{ dados: ResumoGravado | null; stale: boolean }> {
  const atual = await lerResumo();
  const idade = atual ? Date.now() - atual.salvadoEm : Infinity;

  if (atual && idade < CACHE_TTL_MS) return { dados: atual, stale: false };

  if (atual) {
    // Vencido mas utilizável: serve já e atualiza em background.
    void sincronizarEGravar().catch((e) =>
      console.error("[apitou] revalidação em background falhou:", e instanceof Error ? e.message : e),
    );
    return { dados: atual, stale: true };
  }

  const dados = await sincronizarEGravar();
  return { dados, stale: false };
}
