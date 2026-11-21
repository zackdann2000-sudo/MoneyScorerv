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
import chaveCache from "./cache-key.json";

export const CACHE_TTL_MS = 15 * 60 * 1000;
/**
 * A chave vive em `cache-key.json`, e não aqui, porque DOIS processos precisam
 * concordar nela: este store (leitura/gravação pelo app) e
 * `scripts/apitou-sync.mjs` (gravação pelo GitHub Actions).
 *
 * Histórico: a chave foi versionada para `semana-v2` aqui e o script continuou
 * gravando em `semana`, então o cron diário atualizava uma linha que ninguém
 * lia — o app só se atualizava pelo sync preguiçoso. Arquivo único evita a
 * repetição desse erro.
 */
const CHAVE = chaveCache.key;

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
 * Metadados de frescor que TODA rota do módulo devolve junto do payload.
 *
 * `geradoEm` é quando a FONTE gerou o dado; `atualizadoEm` é quando nós
gravamos. São coisas diferentes e o usuário precisa da primeira: se a fonte
parar de gerar, o nosso sync pode continuar "funcionando" (gravando o mesmo
resumo) e o painel pareceria fresco. Quem manda no aviso da tela é `geradoEm`.
 */
export function metaResumo(d: ResumoGravado) {
  return {
    geradoEm: d.geradoEm,
    atualizadoEm: new Date(d.salvadoEm).toISOString(),
    /** Minutos desde a última gravação (frescor do NOSSO lado, para operação). */
    idadeMin: Math.max(0, Math.round((Date.now() - d.salvadoEm) / 60000)),
  };
}

/**
 * Janela mínima entre sincronizações reais — o "dono único por frescor".
 *
 * Três processos podem pedir sync: o Vercel Cron (09:00 UTC), o GitHub Actions
 * (06:00 UTC) e o sync preguiçoso do primeiro request. Sem essa janela, todos
 * baixam 22 MB e sobrescrevem o mesmo registro. Com ela, quem chega primeiro
 * baixa e os outros viram no-op — o dono é decidido por frescor, não por
 * horário de agendamento (que muda sozinho com qualquer ajuste de cron).
 *
 * `APITOU_MIN_REFRESH_MIN` permite afrouxar/apertar sem deploy.
 */
export const MIN_REFRESH_MS = Math.max(
  60_000,
  Number(process.env.APITOU_MIN_REFRESH_MIN ?? 360) * 60_000,
);

export type OpcoesSync = {
  /** Ignora a janela e baixa de novo. Só para operador (`?forcar=1`). */
  forcar?: boolean;
  /** Quem pediu, para o log (`cron`, `actions`, `lazy`, `manual`). */
  origem?: string;
};

export type ResultadoSync = {
  dados: ResumoGravado;
  /** true quando a janela de frescor barrou o download (nada foi baixado). */
  pulado: boolean;
  motivo: string;
};

/**
 * Baixa as fontes, reduz e grava. É a operação CARA (baixa 22 MB) — só roda no
 * job protegido ou no primeiro acesso, nunca em paralelo por request.
 *
 * Uma trava em memória evita que dois requests disparem a sincronização ao
 * mesmo tempo na mesma instância; a janela de frescor (`MIN_REFRESH_MS`) evita
 * que instâncias/agendadores diferentes façam o mesmo download. O lock global
 * (advisory lock do Postgres) é o M3 — a janela já resolve o caso dos
 * agendadores, que é o que causa a sobrescrita.
 */
let sincronizando: Promise<ResultadoSync> | null = null;

export async function sincronizarEGravar(opts: OpcoesSync = {}): Promise<ResultadoSync> {
  if (sincronizando) return sincronizando;

  const origem = opts.origem ?? "sync";

  sincronizando = (async (): Promise<ResultadoSync> => {
    // Gate de frescor: se o dado é mais novo que a janela, baixar de novo só
    // reescreveria o mesmo conteúdo (e custaria 22 MB + 36 s de função).
    const atual = await lerResumo();
    if (!opts.forcar && atual && Date.now() - atual.salvadoEm < MIN_REFRESH_MS) {
      const idadeMin = Math.round((Date.now() - atual.salvadoEm) / 60000);
      console.log(
        `[apitou] sync pulado (${origem}): resumo de ${idadeMin} min atrás, janela de ${Math.round(MIN_REFRESH_MS / 60000)} min`,
      );
      return { dados: atual, pulado: true, motivo: "janela-de-frescor" };
    }

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
        kind: chaveCache.kind,
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
      `[apitou] sincronizado (${origem}) em ${Date.now() - t0}ms: ${res.jogos.length} jogos, ${res.avisos.length} avisos`,
    );
    return { dados: gravado, pulado: false, motivo: origem };
  })().finally(() => {
    sincronizando = null;
  });

  return sincronizando;
}

/**
 * Garante dados frescos para a tela.
 *
 * Devolve três coisas que NÃO são a mesma:
 *  - `stale`: o dado é mais velho que o TTL de leitura (15 min). Só isso não
 *    significa problema — o sync de conteúdo roda de 6 em 6 horas.
 *  - `revalidando`: existe uma atualização A CAMINHO agora (a janela de frescor
 *    permite). É este que a tela pode anunciar; antes, `stale` era usado para
 *    isso e a UI diria "revalidando" por 6h sem nada acontecer.
 *  - `dados`: o payload — nunca nulo quando há qualquer coisa gravada.
 */
export async function garantirResumo(): Promise<{
  dados: ResumoGravado | null;
  stale: boolean;
  revalidando: boolean;
}> {
  const atual = await lerResumo();
  const idade = atual ? Date.now() - atual.salvadoEm : Infinity;

  if (atual && idade < CACHE_TTL_MS) return { dados: atual, stale: false, revalidando: false };

  if (atual) {
    // Dentro da janela de frescor: o dado é "velho para leitura", mas baixar
    // 22 MB de novo não é permitido ainda. Serve e não anuncia revalidação.
    if (idade < MIN_REFRESH_MS) {
      return { dados: atual, stale: true, revalidando: false };
    }

    // Fora da janela: serve já e atualiza em background.
    void sincronizarEGravar({ origem: "lazy" }).catch((e) =>
      console.error("[apitou] revalidação em background falhou:", e instanceof Error ? e.message : e),
    );
    return { dados: atual, stale: true, revalidando: true };
  }

  // Nada em cache: sem isto não há o que mostrar, então espera o download.
  // Aqui a janela de frescor não barra nada (não existe resumo), por isso o
  // resultado tem sempre `pulado: false`.
  const r = await sincronizarEGravar({ origem: "lazy" });
  return { dados: r.dados, stale: false, revalidando: false };
}

/* ------------------------------------------------------------------ */
/* Cache auxiliar: resultado de cálculo (não é o resumo da semana)     */
/* ------------------------------------------------------------------ */

/**
 * Lê/grava resultados derivados do resumo (ex.: a agregação de desajustes).
 *
 * Vive na mesma tabela `apitou_cache` (o M3 é que particiona), com prefixo
 * próprio para poder expurgar sem tocar no resumo. A chave de quem chama deve
 * incluir a versão do resumo (`salvadoEm`): assim um sync novo invalida o
 * cálculo automaticamente e não existe TTL para errar.
 */
export async function lerAux<T>(chave: string): Promise<T | null> {
  try {
    const { db } = await import("@/db");
    const { apitouCache } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");

    const rows = await db
      .select()
      .from(apitouCache)
      .where(eq(apitouCache.cacheKey, chave))
      .limit(1);
    if (!rows.length) return null;
    return rows[0].payload as unknown as T;
  } catch (e) {
    // Cache auxiliar é otimização: falhar aqui não pode derrubar a resposta.
    console.error("[apitou] lerAux falhou:", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function gravarAux<T>(chave: string, kind: string, dados: T): Promise<void> {
  try {
    const { db } = await import("@/db");
    const { apitouCache } = await import("@/db/schema");

    await db
      .insert(apitouCache)
      .values({
        cacheKey: chave,
        kind,
        geradoEm: new Date().toISOString(),
        payload: dados as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: apitouCache.cacheKey,
        set: { payload: dados as unknown as Record<string, unknown>, updatedAt: new Date() },
      });
  } catch (e) {
    console.error("[apitou] gravarAux falhou:", e instanceof Error ? e.message : e);
  }
}

/**
 * Expurga chaves auxiliares antigas (evita crescer sem limite enquanto o M6 de
 * retenção não existe). Só toca no prefixo informado.
 */
export async function expirarAux(prefixo: string, dias = 1): Promise<void> {
  try {
    const { db } = await import("@/db");
    const { apitouCache } = await import("@/db/schema");
    const { and, like, lt } = await import("drizzle-orm");

    await db
      .delete(apitouCache)
      .where(
        and(
          like(apitouCache.cacheKey, `${prefixo}%`),
          lt(apitouCache.updatedAt, new Date(Date.now() - dias * 86400000)),
        ),
      );
  } catch (e) {
    console.error("[apitou] expirarAux falhou:", e instanceof Error ? e.message : e);
  }
}
