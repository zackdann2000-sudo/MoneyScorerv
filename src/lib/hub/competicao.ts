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
import { hubFixture, hubLeague, hubPlayer, hubPlayerStat, hubSeason, hubTeam } from "@/db/hub-schema";
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
  /** Amarelos por jogo — média sobre os jogos em que o cartão foi coletado. */
  amarelosPorJogo: number | null;
  /** Vermelhos por jogo — mesma regra de base. */
  vermelhosPorJogo: number | null;
  /** Quantos jogos tinham amarelos gravados (denominador da média). */
  amostraCartoes: number;
  /** Quantos jogos tinham vermelhos gravados. */
  amostraVermelhos: number;
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
 * Média de gols e cartões — agregado SQL sobre os jogos encerrados.
 *
 * Gols e vermelhos/amarelos saem de colunas da fixture. Os totais de cartão
 * foram persistidos pelo sync (`yellow_cards` / `red_cards`), com `null` quando
 * o fornecedor não informou: `avg()` ignora null naturalmente, então o
 * denominador dos cartões é só o número de jogos em que o dado existe — a base
 * honesta de cada média.
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
      amarelos: sql<number | null>`avg(${hubFixture.yellowCards})::float8`,
      vermelhos: sql<number | null>`avg(${hubFixture.redCards})::float8`,
      jogosComAmarelo: sql<number>`count(${hubFixture.yellowCards})::int`,
      jogosComVermelho: sql<number>`count(${hubFixture.redCards})::int`,
    })
    .from(hubFixture)
    .where(filtroTemporada);

  const jogos = Number(agregado?.jogos ?? 0);
  const ar = (v: number | null, casas = 2) => (v == null ? null : Number(v.toFixed(casas)));

  return {
    total: jogos,
    medias: {
      amostra: jogos,
      golsPorJogo: ar(jogos > 0 ? Number(agregado?.gols ?? 0) / jogos : null),
      golsCasaPorJogo: ar(jogos > 0 ? Number(agregado?.golsCasa ?? 0) / jogos : null),
      golsForaPorJogo: ar(jogos > 0 ? Number(agregado?.golsFora ?? 0) / jogos : null),
      over25Pct: ar(jogos > 0 ? Number(agregado?.over25 ?? 0) / jogos : null, 3),
      bttsPct: ar(jogos > 0 ? Number(agregado?.btts ?? 0) / jogos : null, 3),
      amarelosPorJogo: ar(jogos > 0 ? (agregado?.amarelos ?? null) : null),
      vermelhosPorJogo: ar(jogos > 0 ? (agregado?.vermelhos ?? null) : null),
      amostraCartoes: Number(agregado?.jogosComAmarelo ?? 0),
      amostraVermelhos: Number(agregado?.jogosComVermelho ?? 0),
    },
  };
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
        amostraVermelhos: 0,
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
