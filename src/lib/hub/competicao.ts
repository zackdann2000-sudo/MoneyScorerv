/**
 * Dados de uma competição para a página central da liga (Gap G2).
 *
 * Tudo aqui é LEITURA do banco. Nenhum fornecedor é chamado: quem enche
 * `hub_fixture`, `hub_standing` e `hub_player_stat` é o job de sync. Quando um
 * dado não foi coletado, a função devolve `null` — e a UI mostra "não coletado"
 * em vez de estimar. Estimativa com cara de dado oficial é o pior produto.
 */
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { hubFixture, hubFixtureContext, hubLeague, hubPlayer, hubPlayerStat, hubSeason, hubTeam } from "@/db/hub-schema";
import { lerClassificacao, resolverLigaId, type Classificacao } from "./standings";

/** Estados em que o jogo tem placar final. Espelha `queries.ts`. */
const FINALIZADOS = ["FT", "AET", "PEN"] as const;

export type JogoResumo = {
  id: number;
  kickoff: Date;
  liveState: string;
  homeName: string;
  homeLogo: string | null;
  homeScore: number;
  awayName: string;
  awayLogo: string | null;
  awayScore: number;
  roundName: string | null;
  venueName: string | null;
  /** Tem placar para mostrar? (jogo não começou = false) */
  temPlacar: boolean;
};

export type Artilheiro = {
  playerId: number;
  playerName: string;
  teamName: string | null;
  teamLogo: string | null;
  goals: number;
  assists: number;
  appearances: number;
  minutes: number;
};

export type MediasLiga = {
  /** Jogos encerrados usados no cálculo. */
  amostra: number;
  golsPorJogo: number | null;
  golsCasaPorJogo: number | null;
  golsForaPorJogo: number | null;
  over25Pct: number | null;
  bttsPct: number | null;
  /** Amarelos por jogo — só existe quando o contexto da partida trouxe cartões. */
  amarelosPorJogo: number | null;
  /** Vermelhos por jogo — vem da própria fixture, é o dado mais confiável. */
  vermelhosPorJogo: number | null;
  /** Quantos jogos tinham cartões no contexto (base dos amarelos). */
  amostraCartoes: number;
};

export type DadosCompeticao = {
  liga: {
    id: number;
    name: string;
    slug: string;
    externalRef: string | null;
    countryName: string | null;
    logoUrl: string | null;
    competitionType: string;
    isCup: boolean;
  };
  classificacao: Classificacao | null;
  artilharia: Artilheiro[];
  proximos: JogoResumo[];
  ultimos: JogoResumo[];
  medias: MediasLiga;
  /** Jogos distintos encerrados na temporada (base das médias). */
  totalJogosEncerrados: number;
};

const homeT = alias(hubTeam, "liga_home_team");
const awayT = alias(hubTeam, "liga_away_team");

const colunasJogo = {
  id: hubFixture.id,
  kickoff: hubFixture.matchDate,
  liveState: hubFixture.liveState,
  homeScore: hubFixture.homeScore,
  awayScore: hubFixture.awayScore,
  roundName: hubFixture.roundName,
  venueName: hubFixture.venueName,
  homeName: homeT.name,
  homeLogo: homeT.logoUrl,
  awayName: awayT.name,
  awayLogo: awayT.logoUrl,
};

type LinhaJogo = {
  id: number;
  kickoff: Date;
  liveState: string;
  homeScore: number;
  awayScore: number;
  roundName: string | null;
  venueName: string | null;
  homeName: string;
  homeLogo: string | null;
  awayName: string;
  awayLogo: string | null;
};

const comPlacar = (l: LinhaJogo): JogoResumo => ({
  ...l,
  temPlacar: FINALIZADOS.includes(l.liveState as (typeof FINALIZADOS)[number]),
});

/** Próximos jogos: do apito inicial para frente, mais perto primeiro. */
async function proximosJogos(leagueId: number, limite = 5): Promise<JogoResumo[]> {
  const rows = (await db
    .select(colunasJogo)
    .from(hubFixture)
    .innerJoin(homeT, eq(homeT.id, hubFixture.homeTeamId))
    .innerJoin(awayT, eq(awayT.id, hubFixture.awayTeamId))
    .where(and(eq(hubFixture.leagueId, leagueId), gte(hubFixture.matchDate, new Date())))
    .orderBy(asc(hubFixture.matchDate))
    .limit(limite)) as LinhaJogo[];
  return rows.map(comPlacar);
}

/** Últimos resultados: encerrados, mais recente primeiro. */
async function ultimosJogos(leagueId: number, limite = 5): Promise<JogoResumo[]> {
  const rows = (await db
    .select(colunasJogo)
    .from(hubFixture)
    .innerJoin(homeT, eq(homeT.id, hubFixture.homeTeamId))
    .innerJoin(awayT, eq(awayT.id, hubFixture.awayTeamId))
    .where(and(eq(hubFixture.leagueId, leagueId), inArray(hubFixture.liveState, [...FINALIZADOS])))
    .orderBy(desc(hubFixture.matchDate))
    .limit(limite)) as LinhaJogo[];
  return rows.map(comPlacar);
}

/**
 * Artilharia a partir de `hub_player_stat`.
 *
 * Ordena por gols e, no empate, por assistências — o desempate que qualquer
 * tabela de artilharia usa. Se a tabela não foi coletada, volta vazio: a seção
 * não aparece, não vira "0 gols" para todo mundo.
 */
async function artilhariaDa(leagueId: number, seasonId: number | null): Promise<Artilheiro[]> {
  if (!seasonId) return [];
  const rows = await db
    .select({
      playerId: hubPlayer.id,
      playerName: hubPlayer.name,
      teamName: hubTeam.name,
      teamLogo: hubTeam.logoUrl,
      goals: hubPlayerStat.goals,
      assists: hubPlayerStat.assists,
      appearances: hubPlayerStat.appearances,
      minutes: hubPlayerStat.minutes,
    })
    .from(hubPlayerStat)
    .innerJoin(hubPlayer, eq(hubPlayer.id, hubPlayerStat.playerId))
    .innerJoin(hubSeason, eq(hubSeason.id, hubPlayerStat.seasonId))
    .leftJoin(hubTeam, eq(hubTeam.id, hubPlayerStat.teamId))
    .where(and(eq(hubSeason.leagueId, leagueId), eq(hubPlayerStat.seasonId, seasonId), gte(hubPlayerStat.goals, 1)))
    .orderBy(desc(hubPlayerStat.goals), desc(hubPlayerStat.assists))
    .limit(5);
  return rows;
}

/**
 * Média de gols (SQL, sobre a temporada toda) e de cartões.
 *
 * Gols: agregado no banco, barato e exato.
 * Amarelos: só existem dentro do JSON de contexto da ESPN/Bzzoiro. Lemos uma
 * amostra limitada dos jogos mais recentes que têm contexto e contamos as
 * chaves que falam em cartão — o fornecedor grava o RÓTULO ("Cartões
 * amarelos"), então a busca é por texto, não por chave fixa.
 */
async function mediasDa(leagueId: number, seasonId: number | null): Promise<{ medias: MediasLiga; total: number }> {
  const filtroTemporada = seasonId
    ? and(eq(hubFixture.leagueId, leagueId), eq(hubFixture.seasonId, seasonId), inArray(hubFixture.liveState, [...FINALIZADOS]))
    : and(eq(hubFixture.leagueId, leagueId), inArray(hubFixture.liveState, [...FINALIZADOS]));

  const [agregado] = await db
    .select({
      jogos: sql<number>`count(*)::int`,
      gols: sql<number>`coalesce(sum(${hubFixture.homeScore} + ${hubFixture.awayScore}), 0)::int`,
      golsCasa: sql<number>`coalesce(sum(${hubFixture.homeScore}), 0)::int`,
      golsFora: sql<number>`coalesce(sum(${hubFixture.awayScore}), 0)::int`,
      over25: sql<number>`coalesce(sum(case when (${hubFixture.homeScore} + ${hubFixture.awayScore}) >= 3 then 1 else 0 end), 0)::int`,
      btts: sql<number>`coalesce(sum(case when ${hubFixture.homeScore} > 0 and ${hubFixture.awayScore} > 0 then 1 else 0 end), 0)::int`,
      vermelhos: sql<number>`coalesce(sum(${hubFixture.homeRedCards} + ${hubFixture.awayRedCards}), 0)::int`,
    })
    .from(hubFixture)
    .where(filtroTemporada);

  const jogos = Number(agregado?.jogos ?? 0);

  /* Amarelos: amostra dos jogos com contexto, mais recentes primeiro. */
  let amarelosTotal = 0;
  let jogosComCartao = 0;
  if (jogos > 0) {
    const comContexto = await db
      .select({ stats: hubFixtureContext.stats })
      .from(hubFixtureContext)
      .innerJoin(hubFixture, eq(hubFixture.id, hubFixtureContext.fixtureId))
      .where(filtroTemporada)
      .orderBy(desc(hubFixture.matchDate))
      .limit(120);

    for (const c of comContexto) {
      const cartoes = cartoesDoContexto(c.stats);
      if (cartoes == null) continue;
      amarelosTotal += cartoes.amarelos;
      jogosComCartao++;
    }
  }

  return {
    total: jogos,
    medias: {
      amostra: jogos,
      golsPorJogo: jogos > 0 ? Number((Number(agregado?.gols ?? 0) / jogos).toFixed(2)) : null,
      golsCasaPorJogo: jogos > 0 ? Number((Number(agregado?.golsCasa ?? 0) / jogos).toFixed(2)) : null,
      golsForaPorJogo: jogos > 0 ? Number((Number(agregado?.golsFora ?? 0) / jogos).toFixed(2)) : null,
      over25Pct: jogos > 0 ? Number((Number(agregado?.over25 ?? 0) / jogos).toFixed(3)) : null,
      bttsPct: jogos > 0 ? Number((Number(agregado?.btts ?? 0) / jogos).toFixed(3)) : null,
      amarelosPorJogo: jogosComCartao > 0 ? Number((amarelosTotal / jogosComCartao).toFixed(2)) : null,
      vermelhosPorJogo: jogos > 0 ? Number((Number(agregado?.vermelhos ?? 0) / jogos).toFixed(2)) : null,
      amostraCartoes: jogosComCartao,
    },
  };
}

/**
 * Cartões amarelos de um JSON de contexto.
 *
 * O rótulo vem do fornecedor ("Cartões amarelos", "Yellow Cards"), então a
 * busca é sem acento e case-insensitive. Vermelho é ignorado aqui de propósito:
 * ele já vem na coluna da fixture.
 */
function cartoesDoContexto(stats: unknown): { amarelos: number } | null {
  if (!stats || typeof stats !== "object") return null;
  const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  for (const [chave, valor] of Object.entries(stats as Record<string, { home?: unknown; away?: unknown }>)) {
    const k = semAcento(chave);
    if (!/amarelo|yellow/.test(k)) continue;
    const casa = Number(valor?.home);
    const fora = Number(valor?.away);
    if (!Number.isFinite(casa) || !Number.isFinite(fora)) continue;
    return { amarelos: casa + fora };
  }
  return null;
}

/** Lê tudo que a página da liga precisa. `null` = competição não encontrada. */
export async function dadosDaCompeticao(entrada: string): Promise<DadosCompeticao | null> {
  const leagueId = await resolverLigaId(entrada);
  if (!leagueId) return null;

  const [liga] = await db
    .select({
      id: hubLeague.id,
      name: hubLeague.name,
      slug: hubLeague.slug,
      externalRef: hubLeague.externalRef,
      countryName: hubLeague.countryName,
      logoUrl: hubLeague.logoUrl,
      competitionType: hubLeague.competitionType,
      isCup: hubLeague.hasKnockout,
    })
    .from(hubLeague)
    .where(eq(hubLeague.id, leagueId))
    .limit(1);
  if (!liga) return null;

  /* Temporada: a marcada como atual; sem marca, a mais recente por chave. */
  const temporadas = await db
    .select({ id: hubSeason.id, seasonKey: hubSeason.seasonKey, isCurrent: hubSeason.isCurrent })
    .from(hubSeason)
    .where(eq(hubSeason.leagueId, leagueId))
    .orderBy(desc(hubSeason.seasonKey));
  const temporada = temporadas.find((t) => t.isCurrent) ?? temporadas[0] ?? null;

  const [classificacao, artilharia, proximos, ultimos, { medias, total }] = await Promise.all([
    lerClassificacao(leagueId, temporada ? { seasonKey: temporada.seasonKey } : {}).catch(() => null),
    artilhariaDa(leagueId, temporada?.id ?? null).catch(() => [] as Artilheiro[]),
    proximosJogos(leagueId).catch(() => [] as JogoResumo[]),
    ultimosJogos(leagueId).catch(() => [] as JogoResumo[]),
    mediasDa(leagueId, temporada?.id ?? null).catch(() => ({
      total: 0,
      medias: {
        amostra: 0,
        golsPorJogo: null,
        golsCasaPorJogo: null,
        golsForaPorJogo: null,
        over25Pct: null,
        bttsPct: null,
        amarelosPorJogo: null,
        vermelhosPorJogo: null,
        amostraCartoes: 0,
      } satisfies MediasLiga,
    })),
  ]);

  return {
    liga,
    classificacao,
    artilharia,
    proximos,
    ultimos,
    medias,
    totalJogosEncerrados: total,
  };
}
