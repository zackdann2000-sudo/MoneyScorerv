/**
 * Armazenamento do resumo do apitou no Neon.
 *
 * Por que o banco e não memória: o `/dados.js` tem 22 MB e a Vercel não mantém
 * memória entre invocações. O job grava o resumo reduzido; as telas leem do
 * banco. Memória existe apenas como cache de leitura de curto prazo para não
 * bater no Neon em cada request.
 *
 * M3 — cache PARTICIONADO. Até o M3 existia uma linha (`semana-v2`, ~1,2 MB) com
 * a semana inteira, e por isso abrir um jogo custava parsear a semana, atualizar
 * um dia reescrevia os outros e a agregação de desajustes não tinha cache. Agora
 * são 5 tipos de linha (ver `particoes.ts`), gravadas juntas e lidas por quem
 * precisa de cada uma:
 *
 *   meta:apitou        -> frescor, dias[], totais          (toda rota)
 *   dia:<dia>          -> lista enxuta do dia              (/jogos)
 *   jogo:<id>          -> jogo + props + desajustes        (/jogo/:id)
 *   desajustes:<dia>   -> agregação do dia                 (/desajustes?date=)
 *   desajustes:semana  -> agregação da semana              (/desajustes)
 *
 * **Compatibilidade (Release B do plano):** `semana-v2` continua sendo gravada
 * ao lado das partições e continua sendo o fallback de LEITURA. Enquanto
 * `APITOU_LEGADO_SEMANA` for diferente de "0", os dois mundos coexistem: dá para
 * voltar atrás sem deploy. Quando os logs mostrarem zero fallback por 7 dias,
 * Release C: `APITOU_LEGADO_SEMANA=0` e apagar as linhas `semana*`.
 *
 * TTL: 15 min de leitura, igual ao resto do projeto. Se o dado estiver mais
 * velho, a rota responde com o que tem e sinaliza `stale` — nunca deixa a tela
 * vazia por causa de uma sincronização lenta.
 */
import { sincronizar, type ResumoJogo } from "./fonte";
import {
  LIMITE_KB,
  chaveDesajustes,
  chaveDia,
  chaveJogo,
  chaveMeta,
  diaSaoPaulo,
  enxugar,
  particionar,
  tamanhoKb,
  type JogoEnxuto,
  type MetaApitou,
  type ParticaoDesajustes,
  type ParticaoDia,
  type ParticaoJogo,
} from "./particoes";
import { comLease } from "./lock";
import type { DesajusteCalculado, PropCalculada } from "./analise";
import chaveCache from "./cache-key.json";

export const CACHE_TTL_MS = 15 * 60 * 1000;
/**
 * A chave do resumo legado vive em `cache-key.json`, e não aqui, porque DOIS
 * processos precisam concordar nela: este store (leitura/gravação pelo app) e
 * `scripts/apitou-sync.mjs` (gravação pelo GitHub Actions).
 *
 * Histórico: a chave foi versionada para `semana-v2` aqui e o script continuou
 * gravando em `semana`, então o cron diário atualizava uma linha que ninguém
 * lia — o app só se atualizava pelo sync preguiçoso. Arquivo único evita a
 * repetição desse erro.
 */
const CHAVE_LEGADO = chaveCache.key;

/**
 * Grava `semana-v2` além das partições? Ligado por padrão (Release A/B do M3).
 * `APITOU_LEGADO_SEMANA=0` desliga sem deploy — é o interruptor da Release C.
 */
export const GRAVAR_LEGADO = process.env.APITOU_LEGADO_SEMANA !== "0";

export type ResumoGravado = {
  geradoEm: string;
  fonte: string;
  salvadoEm: number;
  jogos: ResumoJogo[];
  avisos: string[];
};

type LinhaCache = { payload: unknown; updatedAt?: Date | string };

/**
 * Cache em memória do processo (por instância serverless), por chave.
 *
 * TTL curto (15 min, o mesmo do banco) só para não repetir a mesma leitura de
 * `meta:` a cada request do mesmo usuário. A gravação limpa tudo: um sync novo
 * não pode conviver com partição velha em memória.
 */
let mem = new Map<string, { payload: unknown; quando: number }>();

function memLer<T>(chave: string): T | null {
  const hit = mem.get(chave);
  if (!hit) return null;
  if (Date.now() - hit.quando > CACHE_TTL_MS) {
    mem.delete(chave);
    return null;
  }
  return hit.payload as T;
}

function memGravar(chave: string, payload: unknown) {
  mem.set(chave, { payload, quando: Date.now() });
}

/* ------------------------------------------------------------------ */
/* Leitura/gravação crua de uma linha do cache                        */
/* ------------------------------------------------------------------ */

async function lerLinha<T>(chave: string): Promise<T | null> {
  const emMemoria = memLer<T>(chave);
  if (emMemoria) return emMemoria;

  try {
    const { db } = await import("@/db");
    const { apitouCache } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");

    const rows = (await db
      .select()
      .from(apitouCache)
      .where(eq(apitouCache.cacheKey, chave))
      .limit(1)) as unknown as LinhaCache[];
    if (!rows.length) return null;

    const payload = rows[0].payload as T;
    memGravar(chave, payload);
    return payload;
  } catch (e) {
    console.error("[apitou] falha ao ler", chave, ":", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Lê várias linhas irmãs em UMA query (`dia:*` de todos os dias da semana). */
async function lerLinhas<T>(chaves: string[]): Promise<Map<string, T>> {
  const saida = new Map<string, T>();
  const faltando: string[] = [];
  for (const c of chaves) {
    const emMemoria = memLer<T>(c);
    if (emMemoria) saida.set(c, emMemoria);
    else faltando.push(c);
  }
  if (!faltando.length) return saida;

  try {
    const { db } = await import("@/db");
    const { apitouCache } = await import("@/db/schema");
    const { inArray } = await import("drizzle-orm");

    const rows = (await db
      .select()
      .from(apitouCache)
      .where(inArray(apitouCache.cacheKey, faltando))) as unknown as (LinhaCache & {
      cacheKey: string;
    })[];

    for (const r of rows) {
      saida.set(r.cacheKey, r.payload as T);
      memGravar(r.cacheKey, r.payload);
    }
  } catch (e) {
    console.error("[apitou] falha ao ler partições:", e instanceof Error ? e.message : e);
  }
  return saida;
}

/** Lê todas as linhas de um prefixo (`dia:%`) em UMA query. */
async function lerPorPrefixo<T>(prefixo: string): Promise<Map<string, T>> {
  const saida = new Map<string, T>();
  try {
    const { db } = await import("@/db");
    const { apitouCache } = await import("@/db/schema");
    const { like } = await import("drizzle-orm");

    const rows = (await db
      .select()
      .from(apitouCache)
      .where(like(apitouCache.cacheKey, `${prefixo}%`))) as unknown as (LinhaCache & {
      cacheKey: string;
    })[];

    for (const r of rows) {
      saida.set(r.cacheKey, r.payload as T);
      memGravar(r.cacheKey, r.payload);
    }
  } catch (e) {
    console.error("[apitou] falha ao ler prefixo", prefixo, ":", e instanceof Error ? e.message : e);
  }
  return saida;
}

async function gravarLinhas(
  linhas: { cacheKey: string; kind: string; geradoEm: string; payload: unknown }[],
): Promise<void> {
  if (!linhas.length) return;
  const { db } = await import("@/db");
  const { apitouCache } = await import("@/db/schema");

  // Um upsert por linha, na mesma transação: ou a semana inteira entra, ou
  // nada entra. Sem isso, uma falha no meio deixaria `meta:` novo apontando
  // para dias velhos (e a versão não bateria — a leitura cairia no legado).
  await db.transaction(async (tx) => {
    for (const l of linhas) {
      const payload = l.payload as unknown as Record<string, unknown>;
      await tx
        .insert(apitouCache)
        .values({
          cacheKey: l.cacheKey,
          kind: l.kind,
          geradoEm: l.geradoEm,
          payload,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: apitouCache.cacheKey,
          set: { kind: l.kind, geradoEm: l.geradoEm, payload, updatedAt: new Date() },
        });
    }
  });

  for (const l of linhas) memGravar(l.cacheKey, l.payload);
}

/* ------------------------------------------------------------------ */
/* Partições: escopo e versão                                         */
/* ------------------------------------------------------------------ */

/**
 * Escopo de leitura das rotas.
 *
 * `semana` existe porque `/desajustes` (sem `?date`) e `/jogos` (sem `?date`)
 * olham a semana inteira. É o único caso que lê mais de uma partição.
 */
export type Escopo = { dia: string | null };

/**
 * Uma partição é válida se a `versao` bate com a meta. É isto que substitui o
 * TTL por chave: quando o sync grava (nova versão), as partições antigas deixam
 * de ser lidas automaticamente, sem job de invalidação.
 */
function versaoConfere(particao: { versao?: string } | null, meta: MetaApitou | null): boolean {
  if (!particao) return false;
  if (!meta) return true; // sem meta não há como comparar; aceita o que existe
  return String(particao.versao) === String(meta.versao);
}

/* ------------------------------------------------------------------ */
/* Sync: janela de frescor, lock e gravação particionada               */
/* ------------------------------------------------------------------ */

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
  /** true quando a janela de frescor ou o lock barraram o download. */
  pulado: boolean;
  motivo: string;
};

/**
 * Baixa as fontes, reduz e grava. É a operação CARA (baixa 22 MB) — só roda no
 * job protegido ou no primeiro acesso, nunca em paralelo por request.
 *
 * Duas travas, com papéis diferentes:
 *  - `sincronizando` (Promise em memória): dedupe dentro da MESMA instância.
 *  - advisory lock do Postgres: dedupe entre instâncias e contra o GitHub
 *    Actions. Quem não pega o lock não espera, serve o cache atual e sai.
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

    // Lock GLOBAL: duas lambdas (ou a lambda + o Actions) não baixam 22 MB ao
    // mesmo tempo. Não pegar o lock não é erro: outro processo está fazendo.
    // É lease em tabela, não advisory lock — no pooler do Neon a sessão é
    // compartilhada e o advisory lock não excluiria nada (ver lock.ts).
    const dentro = await comLease(async () => {
      // Relê DEPOIS do lock: quem esperou na fila do banco pode descobrir que
      // outro processo acabou de gravar (dupla checagem, sem janela de corrida
      // entre ler o frescor e pegar o lock).
      const agora = await lerResumo({ ignorarMemoria: true });
      if (!opts.forcar && agora && Date.now() - agora.salvadoEm < MIN_REFRESH_MS) {
        return { dados: agora, pulado: true, motivo: "janela-de-frescor" } as ResultadoSync;
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

      const stats = await gravarParticionado(gravado);
      console.log(
        `[apitou] sincronizado (${origem}) em ${Date.now() - t0}ms: ${res.jogos.length} jogos, ` +
          `${res.avisos.length} avisos, ${stats.linhas} linhas (maior ${stats.maiorKb} KB, ${stats.orfasRemovidas} órfãs removidas)`,
      );
      return { dados: gravado, pulado: false, motivo: origem } as ResultadoSync;
    });

    if (dentro.negado) {
      console.log(`[apitou] sync não executado (${origem}): lock global ${dentro.motivo}`);
      // Serve o que existe; sem nada gravado, a rota responde 503 — e o correto
      // é o operador tentar de novo em segundos, não a lambda esperar 36 s.
      const existente = await lerResumo();
      if (existente) {
        return { dados: existente, pulado: true, motivo: `lock-${dentro.motivo}` };
      }
      throw new Error(
        dentro.motivo === "ocupado"
          ? "sincronização em andamento em outro processo; tente de novo em instantes"
          : `não foi possível pegar o lock do sync: ${dentro.erro ?? "erro desconhecido"}`,
      );
    }

    return dentro.valor;
  })().finally(() => {
    sincronizando = null;
  });

  return sincronizando;
}

/**
 * Grava o resumo do jeito novo (particionado) e, enquanto a Release C não
 * acontece, também em `semana-v2` (dual write da Release A).
 *
 * Devolve contagens para o log do sync — e o maior tamanho de linha, que é o
 * que denuncia partição grande demais (critério do M3: nada acima de 120 KB).
 */
export async function gravarParticionado(resumo: ResumoGravado): Promise<{
  linhas: number;
  maiorKb: number;
  avisosTamanho: string[];
  orfasRemovidas: number;
}> {
  const { linhas, tamanhos } = particionar(resumo);

  await gravarLinhas(linhas);

  if (GRAVAR_LEGADO) {
    await gravarLinhas([
      {
        cacheKey: CHAVE_LEGADO,
        kind: chaveCache.kind,
        geradoEm: resumo.geradoEm,
        payload: resumo,
      },
    ]);
  }

  const avisosTamanho = tamanhos
    .filter((t) => t.kb > LIMITE_KB)
    .map((t) => `${t.chave} com ${t.kb} KB (teto ${LIMITE_KB} KB)`);
  if (avisosTamanho.length) {
    console.warn(`[apitou] partição acima do teto: ${avisosTamanho.join("; ")}`);
  }

  /*
   * Expurgo de ÓRFÃS: partições que existiam no sync anterior e não existem
   * neste (jogo que saiu da semana, dia que ficou vazio). Elas não são lidas
   * (a versão não bate), mas ficam ocupando espaço — e num cache que cresce por
   * jogo isso vira lixo permanente sem o M6 de retenção.
   *
   * Roda só depois da gravação dar certo: se o sync falhou, o cache antigo tem
   * que continuar inteiro para as rotas seguirem servindo.
   */
  const orfas = await purgarOrfas(linhas.map((l) => l.cacheKey));

  const maiorKb = tamanhos.reduce((m, t) => Math.max(m, t.kb), 0);
  return {
    linhas: linhas.length + (GRAVAR_LEGADO ? 1 : 0),
    maiorKb,
    avisosTamanho,
    orfasRemovidas: orfas,
  };
}

/** Prefixos que pertencem ao sync atual e podem ser expurgados por comparação. */
const PREFIXOS_PARTICAO = ["dia:", "jogo:", "desajustes:"];

/**
 * Apaga partições com prefixo deste módulo cuja chave não está no sync novo.
 *
 * Devolve quantas linhas saíram (para o log do sync). Falha aqui não é fatal:
 * é limpeza, não correção.
 */
async function purgarOrfas(chavesNovas: string[]): Promise<number> {
  if (!chavesNovas.length) return 0;
  try {
    const { db } = await import("@/db");
    const { apitouCache } = await import("@/db/schema");
    const { and, inArray, notInArray, or, like } = await import("drizzle-orm");

    const removidas = await db
      .delete(apitouCache)
      .where(
        and(
          or(
            like(apitouCache.cacheKey, "dia:%"),
            like(apitouCache.cacheKey, "jogo:%"),
            like(apitouCache.cacheKey, "desajustes:%"),
          ),
          notInArray(apitouCache.cacheKey, chavesNovas),
        ),
      )
      .returning({ chave: apitouCache.cacheKey });

    // Limpa também a memória da instância para não servir chave já apagada.
    for (const r of removidas) mem.delete(r.chave);
    return removidas.length;
  } catch (e) {
    console.error("[apitou] expurgo de órfãs falhou:", e instanceof Error ? e.message : e);
    return 0;
  }
}

/** Só para o teste/documentação: os prefixos que o expurgo toca. */
export const PREFIXOS_EXPURGAVEIS = PREFIXOS_PARTICAO;

/* ------------------------------------------------------------------ */
/* Leitura: legado (fallback) e partições                              */
/* ------------------------------------------------------------------ */

/** Lê o resumo legado (`semana-v2`). É o fallback da Release B. */
export async function lerLegado(opcoes: { ignorarMemoria?: boolean } = {}): Promise<ResumoGravado | null> {
  if (opcoes.ignorarMemoria) mem.delete(CHAVE_LEGADO);
  return lerLinha<ResumoGravado>(CHAVE_LEGADO);
}

/** Metadados de frescor que TODA rota do módulo devolve junto do payload. */
export function metaResumo(d: { geradoEm: string; salvadoEm: number }) {
  return {
    geradoEm: d.geradoEm,
    atualizadoEm: new Date(d.salvadoEm).toISOString(),
    /** Minutos desde a última gravação (frescor do NOSSO lado, para operação). */
    idadeMin: Math.max(0, Math.round((Date.now() - d.salvadoEm) / 60000)),
  };
}

/**
 * Lê o resumo (semana inteira), preferindo as partições e caindo no legado.
 *
 * Continua existindo porque o `/sync?estado=1` e o cron diário querem saber "tem
 * dado? de quando?" e porque o fallback da Release B precisa da semana montada.
 * As ROTAS não usam mais isto — elas leem só a sua partição.
 */
export async function lerResumo(opcoes: { ignorarMemoria?: boolean } = {}): Promise<ResumoGravado | null> {
  const legado = await lerLegado(opcoes);
  if (legado) return legado;

  // Sem linha legada (Release C, ou banco recém-particionado): monta a semana a
  // partir de `jogo:*`. É mais caro, mas é o caminho de exceção.
  const meta = await lerMeta();
  if (!meta) return null;
  const chaves: string[] = [];
  for (const dia of meta.dias) {
    const p = await lerLinha<ParticaoDia>(chaveDia(dia));
    for (const j of p?.jogos ?? []) chaves.push(chaveJogo(j.id));
  }
  const jogos = await lerLinhas<ParticaoJogo>(chaves);
  const lista = [...jogos.values()]
    .filter((p) => versaoConfere(p, meta))
    .map((p) => p.jogo)
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));

  if (!lista.length) return null;
  return {
    geradoEm: meta.geradoEm,
    fonte: meta.fonte,
    salvadoEm: meta.salvadoEm,
    jogos: lista,
    avisos: meta.avisos,
  };
}

/** Lê a meta (barata: ~1 KB). É o primeiro passo de toda rota. */
export async function lerMeta(): Promise<MetaApitou | null> {
  const meta = await lerLinha<MetaApitou>(chaveMeta());
  if (meta) return meta;
  return null;
}

/** Idade do resumo em ms, ou Infinity se não houver. */
export async function idadeResumo(): Promise<number> {
  const meta = await lerMeta();
  const salvadoEm = meta?.salvadoEm ?? (await lerLegado())?.salvadoEm;
  if (!salvadoEm) return Infinity;
  return Date.now() - salvadoEm;
}

/**
 * Serve o que existe e dispara revalidação em background quando o dado passou da
 * janela de frescor.
 *
 * Devolve três coisas que NÃO são a mesma:
 *  - `stale`: mais velho que o TTL de leitura (15 min). Só isso não é problema —
 *    o sync de conteúdo roda de 6 em 6 horas.
 *  - `revalidando`: existe atualização A CAMINHO agora. É este que a tela pode
 *    anunciar; antes, `stale` era usado para isso e a UI dizia "revalidando" por
 *    6h sem nada acontecer.
 */
export async function frescor(meta: MetaApitou | null): Promise<{
  stale: boolean;
  revalidando: boolean;
}> {
  if (!meta) return { stale: false, revalidando: false };
  const idade = Date.now() - meta.salvadoEm;
  if (idade < CACHE_TTL_MS) return { stale: false, revalidando: false };
  if (idade < MIN_REFRESH_MS) return { stale: true, revalidando: false };

  void sincronizarEGravar({ origem: "lazy" }).catch((e) =>
    console.error("[apitou] revalidação em background falhou:", e instanceof Error ? e.message : e),
  );
  return { stale: true, revalidando: true };
}

/* ------------------------------------------------------------------ */
/* Leitura por partição (o que as rotas usam)                          */
/* ------------------------------------------------------------------ */

export type RespostaBase = {
  meta: MetaApitou | null;
  stale: boolean;
  revalidando: boolean;
  /** true = o dado veio do `semana-v2` porque a partição não existia. */
  legado: boolean;
};

/**
 * Lista enxuta de jogos de um dia (ou da semana, com `dia = null`).
 *
 * `/api/apitou/jogos` com data lê UMA linha `dia:<dia>` (~5 KB). Sem data lê as
 * `dia:*` da semana numa única query.
 */
export async function garantirDias(dia: string | null): Promise<
  RespostaBase & { dias: string[]; jogos: JogoEnxuto[]; fonte: string }
> {
  /*
   * Uma ida ao banco por request. `meta` e a partição vêm juntas: duas leituras
   * sequenciais custariam dois round-trips (medido: ~150 ms cada de um cliente
   * remoto ao Neon). A meta só serve para saber se a partição é da versão atual.
   */
  if (dia) {
    const linhas = await lerLinhas<ParticaoDia | MetaApitou>([chaveMeta(), chaveDia(dia)]);
    const meta = (linhas.get(chaveMeta()) as MetaApitou) ?? null;
    const particao = (linhas.get(chaveDia(dia)) as ParticaoDia) ?? null;

    if (particao && versaoConfere(particao, meta)) {
      const f = await frescor(meta);
      return {
        meta,
        ...f,
        legado: false,
        dias: meta?.dias ?? [particao.dia],
        jogos: particao.jogos,
        fonte: meta?.fonte ?? "",
      };
    }
    return fallbackDias(dia, meta);
  }

  // Sem data: todas as partições de dia. Aqui não há como saber os dias antes
  // de ler — então a leitura é por prefixo, numa query só.
  const particoes = await lerPorPrefixo<ParticaoDia>("dia:");
  const lista = [...particoes.values()].sort((a, b) => a.dia.localeCompare(b.dia));
  if (lista.length) {
    // A versão mais recente é a verdadeira; partições de syncs antigos saem.
    const maisNova = lista.reduce((m, p) => (p.salvadoEm > m.salvadoEm ? p : m), lista[0]);
    const validas = lista.filter((p) => p.versao === maisNova.versao);
    const meta = (await lerMeta()) ?? metaDaParticao(maisNova);
    const f = await frescor(meta);
    return {
      meta,
      ...f,
      legado: false,
      dias: validas.map((p) => p.dia),
      jogos: validas.flatMap((p) => p.jogos).sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff)),
      fonte: meta?.fonte ?? "",
    };
  }

  return fallbackDias(null, await lerMeta());
}

/** Caminho de exceção: a partição não serve, então recorta a semana legada. */
async function fallbackDias(
  dia: string | null,
  meta: MetaApitou | null,
): Promise<RespostaBase & { dias: string[]; jogos: JogoEnxuto[]; fonte: string }> {
  const semana = await garantirSemanaLegada();
  if (!semana) {
    return { meta, stale: false, revalidando: false, legado: true, dias: [], jogos: [], fonte: "" };
  }

  const m = meta ?? metaDoResumo(semana);
  const jogosSemana = dia ? semana.jogos.filter((j) => diaSaoPaulo(j.kickoff) === dia) : semana.jogos;
  return {
    meta: m,
    ...(await frescor(m)),
    legado: true,
    dias: [...new Set(semana.jogos.map((j) => diaSaoPaulo(j.kickoff)))].sort(),
    jogos: jogosSemana.map(enxugar).sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff)),
    fonte: semana.fonte,
  };
}

/** Meta derivada de uma partição de dia (quando `meta:apitou` não está na leitura). */
function metaDaParticao(p: ParticaoDia): MetaApitou {
  return {
    versao: p.versao,
    geradoEm: p.geradoEm,
    salvadoEm: p.salvadoEm,
    fonte: "",
    dias: [p.dia],
    jogosTotal: p.jogos.length,
    propsTotal: 0,
    desajustesTotal: 0,
    avisos: [],
  };
}

/**
 * Detalhe de um jogo com as props JÁ calculadas.
 *
 * Lê uma linha `jogo:<id>` (~30 KB). Antes, esta rota carregava a semana inteira
 * e rodava `calcularJogo` a cada request — o caminho mais caro do módulo.
 */
export async function garantirJogo(fixtureId: number): Promise<
  RespostaBase & { jogo: ResumoJogo | null; props: PropCalculada[]; desajustes: DesajusteCalculado[] }
> {
  // Uma ida ao banco: meta + jogo na mesma query (ver comentário em garantirDias).
  const linhas = await lerLinhas<ParticaoJogo | MetaApitou>([chaveMeta(), chaveJogo(fixtureId)]);
  const meta = (linhas.get(chaveMeta()) as MetaApitou) ?? null;
  const particao = (linhas.get(chaveJogo(fixtureId)) as ParticaoJogo) ?? null;

  if (particao && versaoConfere(particao, meta)) {
    const f = await frescor(meta);
    return {
      meta,
      ...f,
      legado: false,
      jogo: particao.jogo,
      props: particao.props,
      desajustes: particao.desajustes,
    };
  }

  const semana = await garantirSemanaLegada();
  if (!semana) {
    return { meta, stale: false, revalidando: false, legado: true, jogo: null, props: [], desajustes: [] };
  }

  const jogo = semana.jogos.find((j) => j.id === fixtureId) ?? null;
  const m = meta ?? metaDoResumo(semana);

  // Sem a partição, o cálculo acontece aqui — é o comportamento antigo,
  // mantido só como rede de segurança.
  let props: PropCalculada[] = [];
  let desajustes: DesajusteCalculado[] = [];
  if (jogo) {
    const { calcularJogo, extrairDesajustes } = await import("./analise");
    props = calcularJogo(jogo);
    desajustes = extrairDesajustes(props);
  }
  return { meta: m, ...(await frescor(m)), legado: true, jogo, props, desajustes };
}

/** Desajustes agregados do dia (ou da semana, com `escopo = "semana"`). */
export async function garantirDesajustes(escopo: string): Promise<
  RespostaBase & { itens: DesajusteCalculado[] }
> {
  // Uma ida ao banco: meta + agregação do escopo.
  const linhas = await lerLinhas<ParticaoDesajustes | MetaApitou>([
    chaveMeta(),
    chaveDesajustes(escopo),
  ]);
  const meta = (linhas.get(chaveMeta()) as MetaApitou) ?? null;
  const particao = (linhas.get(chaveDesajustes(escopo)) as ParticaoDesajustes) ?? null;

  if (particao && versaoConfere(particao, meta)) {
    const f = await frescor(meta);
    return { meta, ...f, legado: false, itens: particao.itens };
  }

  const semana = await garantirSemanaLegada();
  if (!semana) return { meta, stale: false, revalidando: false, legado: true, itens: [] };

  const { calcularTodas, extrairDesajustes } = await import("./analise");
  const jogos =
    escopo === "semana" ? semana.jogos : semana.jogos.filter((j) => diaSaoPaulo(j.kickoff) === escopo);
  const m = meta ?? metaDoResumo(semana);
  return {
    meta: m,
    ...(await frescor(m)),
    legado: true,
    itens: extrairDesajustes(calcularTodas(jogos)),
  };
}

/**
 * Garante a semana legada em memória para o fallback.
 *
 * Quando ela existe, as partições são REGRAVADAS a partir dela (backfill): é o
 * que faz um banco no meio da migração não ficar preso no caminho antigo para
 * sempre. O backfill é oportunista — se falhar, a leitura continua correta.
 */
async function garantirSemanaLegada(): Promise<ResumoGravado | null> {
  const semana = await lerLegado();
  if (!semana) return null;
  void gravarParticionado(semana).catch((e) =>
    console.error("[apitou] backfill das partições falhou:", e instanceof Error ? e.message : e),
  );
  return semana;
}

function metaDoResumo(r: ResumoGravado): MetaApitou {
  const dias = [...new Set(r.jogos.map((j) => diaSaoPaulo(j.kickoff)))].sort();
  return {
    versao: String(r.salvadoEm),
    geradoEm: r.geradoEm,
    salvadoEm: r.salvadoEm,
    fonte: r.fonte,
    dias,
    jogosTotal: r.jogos.length,
    propsTotal: 0,
    desajustesTotal: 0,
    avisos: r.avisos.slice(0, 50),
  };
}

/**
 * Compatibilidade: as rotas antigas chamavam `garantirResumo()` e recebiam a
 * semana inteira. Mantido para o cron diário; as rotas /apitou/* migraram para
 * `garantirDias`/`garantirJogo`/`garantirDesajustes`.
 */
export async function garantirResumo(): Promise<{
  dados: ResumoGravado | null;
  stale: boolean;
  revalidando: boolean;
}> {
  const meta = await lerMeta();
  const semana = await lerResumo();
  if (semana) {
    const f = meta ? await frescor(meta) : { stale: false, revalidando: false };
    return { dados: semana, ...f };
  }
  const r = await sincronizarEGravar({ origem: "lazy" });
  return { dados: r.dados, stale: false, revalidando: false };
}

/* ------------------------------------------------------------------ */
/* Cache auxiliar (fora do particionamento)                            */
/* ------------------------------------------------------------------ */

/**
 * Lê/grava resultados derivados que não têm lugar nas 5 partições.
 *
 * Depois do M3 as rotas do apitou não usam mais isto; ficou porque outros
 * módulos reaproveitam o padrão e porque é o caminho para um cálculo novo não
 * precisar inventar tabela.
 */
export async function lerAux<T>(chave: string): Promise<T | null> {
  return lerLinha<T>(chave);
}

export async function gravarAux<T>(chave: string, kind: string, dados: T): Promise<void> {
  try {
    await gravarLinhas([{ cacheKey: chave, kind, geradoEm: new Date().toISOString(), payload: dados }]);
  } catch (e) {
    console.error("[apitou] gravarAux falhou:", e instanceof Error ? e.message : e);
  }
}

/**
 * Expurga chaves antigas por prefixo (evita crescer sem limite enquanto o M6 de
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

/** Tamanho de uma partição em KB — usado pelos testes e pelo log do sync. */
export const kbDe = tamanhoKb;
