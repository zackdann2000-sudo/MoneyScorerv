/**
 * Ponte entre o motor puro (`tendencias.ts`) e o mundo real: ESPN + banco.
 *
 * ============================ POR QUE ESTE ARQUIVO EXISTE ====================
 * `tendencias.ts` é puro e não sabe o que é HTTP nem Postgres. Aqui ficam as
 * duas coisas caras e chatas:
 *
 *   1. CACHE PERSISTENTE. `getTeamHistory()` gasta 1 chamada de schedule + N de
 *      summary (10 jogos = 11 requisições por time). O `cached()` de
 *      `lib/cache.ts` é memória de instância: em serverless, cold start zera.
 *      A tabela `team_history_cache` é o que faz a conta ser paga uma vez por
 *      time a cada 12h, em vez de a cada requisição.
 *
 *   2. NORMALIZAÇÃO. `HistGame` traz `events` (dezenas por jogo) que o motor de
 *      tendências não usa e que só inflam o jsonb. Compactamos na escrita e
 *      reconstruímos na leitura.
 *
 * Regra de ouro do módulo: NUNCA falhar a tela por causa do cache. Erro de
 * banco cai para "busca na rede"; erro de rede cai para o dado vencido; sem
 * nada, a resposta vem vazia e a UI diz "sem histórico suficiente".
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { teamHistoryCache } from "@/db/schema";
import { getTeamHistory, type HistGame } from "./espn";
import { AMOSTRA_PADRAO, MIN_AMOSTRA, type JogoAmostra } from "./tendencias";

/** 12h: o último-10 de um time não muda mais que isso, e cobre dois fusos. */
export const TTL_MS = 12 * 60 * 60 * 1000;

/** O que guardamos de cada jogo — só o que o motor lê, sem `events`. */
type JogoCompacto = {
  id: string;
  date: string;
  league: string;
  home: boolean;
  opp: { id: string; name: string; short: string; logo: string };
  gf: number;
  ga: number;
  res: "V" | "E" | "D";
  htGf: number | null;
  htGa: number | null;
  corners: number | null;
  fouls: number | null;
  yellow: number | null;
  red: number | null;
  offsides: number | null;
  sot: number | null;
  shots: number | null;
  poss: number | null;
  oppCorners: number | null;
  oppSot: number | null;
  oppFouls: number | null;
  oppYellow: number | null;
  oppOffsides: number | null;
};

/** Chave estável do cache: uma linha por time × liga. */
export function chaveHistorico(league: string, teamId: string): string {
  return `${league}:${teamId}`;
}

/** `HistGame` → versão sem `events`, que é o peso morto para esta finalidade. */
export function compactar(g: HistGame): JogoCompacto {
  return {
    id: g.id,
    date: g.date,
    league: g.league,
    home: g.home,
    opp: { id: g.opp?.id ?? "", name: g.opp?.name ?? "", short: g.opp?.short ?? "", logo: g.opp?.logo ?? "" },
    gf: g.gf,
    ga: g.ga,
    res: g.res,
    htGf: g.htGf ?? null,
    htGa: g.htGa ?? null,
    corners: g.corners ?? null,
    fouls: g.fouls ?? null,
    yellow: g.yellow ?? null,
    red: g.red ?? null,
    offsides: g.offsides ?? null,
    sot: g.sot ?? null,
    shots: g.shots ?? null,
    poss: g.poss ?? null,
    oppCorners: g.oppCorners ?? null,
    oppSot: g.oppSot ?? null,
    oppFouls: g.oppFouls ?? null,
    oppYellow: g.oppYellow ?? null,
    oppOffsides: g.oppOffsides ?? null,
  };
}

/** Só o contrato que o motor exige. Aceita `HistGame` e o compacto. */
export function paraAmostra(g: HistGame | JogoCompacto): JogoAmostra {
  return {
    date: g.date,
    home: g.home,
    gf: g.gf,
    ga: g.ga,
    htGf: g.htGf ?? null,
    htGa: g.htGa ?? null,
    corners: g.corners ?? null,
    oppCorners: g.oppCorners ?? null,
    fouls: g.fouls ?? null,
    oppFouls: g.oppFouls ?? null,
    yellow: g.yellow ?? null,
    red: g.red ?? null,
    oppYellow: g.oppYellow ?? null,
    oppRed: (g as { oppRed?: number | null }).oppRed ?? null,
    shots: g.shots ?? null,
    sot: g.sot ?? null,
    offsides: g.offsides ?? null,
  };
}

export type OrigemDado = "cache" | "rede" | "vencido" | "vazio";

export type HistoricoCarregado = {
  jogos: HistGame[];
  baseParcial: boolean;
  origem: OrigemDado;
  idadeMin: number | null;
  source: string;
};

const vazio = (source = "ESPN"): HistoricoCarregado => ({
  jogos: [],
  baseParcial: true,
  origem: "vazio",
  idadeMin: null,
  source,
});

/** Lê a linha do cache. Devolve null em qualquer problema — nunca lança. */
export async function lerHistorico(
  league: string,
  teamId: string,
): Promise<{ jogos: HistGame[]; baseParcial: boolean; source: string; idadeMs: number; amostra: number } | null> {
  try {
    const linhas = await db
      .select()
      .from(teamHistoryCache)
      .where(and(eq(teamHistoryCache.league, league), eq(teamHistoryCache.teamId, teamId)))
      .limit(1);
    const row = linhas[0];
    if (!row) return null;
    const jogos = Array.isArray(row.payload) ? (row.payload as unknown as HistGame[]) : [];
    if (!jogos.length) return null;
    const fetched = row.fetchedAt ? new Date(row.fetchedAt).getTime() : 0;
    return {
      jogos,
      baseParcial: Boolean(row.baseParcial),
      source: row.source || "ESPN",
      idadeMs: Math.max(0, Date.now() - fetched),
      amostra: row.amostra || jogos.length,
    };
  } catch {
    return null;
  }
}

/** Grava (upsert). Falha de cache nunca derruba a resposta. */
async function gravarHistorico(
  league: string,
  teamId: string,
  teamName: string,
  jogos: HistGame[],
  baseParcial: boolean,
  source: string,
): Promise<void> {
  if (!jogos.length) return;
  const agora = new Date();
  const valores = {
    id: chaveHistorico(league, teamId),
    league,
    teamId,
    teamName,
    payload: jogos.map(compactar) as unknown as object[],
    amostra: jogos.length,
    baseParcial,
    source,
    fetchedAt: agora,
  };
  try {
    await db
      .insert(teamHistoryCache)
      .values(valores)
      .onConflictDoUpdate({
        target: teamHistoryCache.id,
        set: {
          teamName,
          payload: valores.payload,
          amostra: valores.amostra,
          baseParcial,
          source,
          fetchedAt: agora,
        },
      });
  } catch {
    /* cache é otimização: se o banco recusar, seguimos com o dado em mão */
  }
}

/**
 * Histórico de um time, com cache-aside.
 *
 * Ordem de decisão:
 *   1. linha fresca e com amostra suficiente  → devolve do banco (custo zero)
 *   2. senão                                  → busca na ESPN e regrava
 *   3. rede falhou                            → devolve a linha vencida
 *   4. nada                                   → vazio, e a UI explica
 *
 * `forcar` ignora o frescor (usado por script de manutenção, nunca pela tela).
 */
export async function carregarHistorico(
  league: string,
  teamId: string,
  amostra = AMOSTRA_PADRAO,
  opts: { forcar?: boolean; teamName?: string } = {},
): Promise<HistoricoCarregado> {
  const alvo = Math.max(MIN_AMOSTRA, amostra);
  const emCache = await lerHistorico(league, teamId);

  const fresco = emCache && emCache.idadeMs < TTL_MS && emCache.amostra >= alvo;
  if (fresco && !opts.forcar) {
    return {
      jogos: emCache.jogos,
      baseParcial: emCache.baseParcial,
      origem: "cache",
      idadeMin: Math.round(emCache.idadeMs / 60000),
      source: emCache.source,
    };
  }

  try {
    const r = await getTeamHistory(league, teamId, alvo);
    if (!r.games.length) {
      /* Rede respondeu vazio: se havia algo vencido, é melhor servir. */
      if (emCache?.jogos.length) {
        return {
          jogos: emCache.jogos,
          baseParcial: emCache.baseParcial,
          origem: "vencido",
          idadeMin: Math.round(emCache.idadeMs / 60000),
          source: emCache.source,
        };
      }
      return vazio(r.source);
    }
    await gravarHistorico(league, teamId, opts.teamName ?? "", r.games, r.baseParcial, r.source || "ESPN");
    return {
      jogos: r.games,
      baseParcial: r.baseParcial,
      origem: "rede",
      idadeMin: 0,
      source: r.source || "ESPN",
    };
  } catch {
    if (emCache?.jogos.length) {
      return {
        jogos: emCache.jogos,
        baseParcial: emCache.baseParcial,
        origem: "vencido",
        idadeMin: Math.round(emCache.idadeMs / 60000),
        source: emCache.source,
      };
    }
    return vazio();
  }
}

/** Histórico dos dois lados do confronto, em paralelo. */
export async function historicoDoConfronto(
  league: string,
  casa: { id: string; name?: string },
  fora: { id: string; name?: string },
  amostra = AMOSTRA_PADRAO,
  opts: { forcar?: boolean } = {},
): Promise<{ casa: HistoricoCarregado; fora: HistoricoCarregado }> {
  const [hc, hf] = await Promise.all([
    carregarHistorico(league, casa.id, amostra, { ...opts, teamName: casa.name }),
    carregarHistorico(league, fora.id, amostra, { ...opts, teamName: fora.name }),
  ]);
  return { casa: hc, fora: hf };
}

/** Converte o histórico carregado na forma que o motor puro consome. */
export function amostraDe(h: HistoricoCarregado): JogoAmostra[] {
  return h.jogos.map(paraAmostra);
}

/**
 * Metadado de procedência para a UI. É o argumento de venda: dizemos quantos
 * jogos realmente sustentam o número — e de onde vieram.
 */
export function metaAmostra(h: { origem: OrigemDado; idadeMin: number | null; source: string; jogos: HistGame[] }) {
  return {
    origem: h.origem,
    idadeMin: h.idadeMin,
    fonte: h.source || "ESPN",
    jogos: h.jogos.length,
  };
}
