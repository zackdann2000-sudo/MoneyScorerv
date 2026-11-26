import { and, asc, desc, eq, gt, gte, inArray, lt, lte, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  hubAnalysis,
  hubBookmakerOdd,
  hubFixture,
  hubFixtureContext,
  hubLeague,
  hubPredictionRow,
  hubTeam,
  hubTopScore,
  hubValueBet,
  hubXgFactor,
  hubFixtureSource,
  type HubAnalysisSummary,
  type HubH2H,
  type HubLabInsight,
  type HubMatchStats,
} from "@/db/hub-schema";
import type { TopScore } from "./model";
import { compararCasas, SELECOES_COMPARATIVO, type ComparativoSelecao, type OddsIndex } from "./model";
import { preferirAnalise } from "./amostra";
import { gerarRelatorio, type RelatorioIA } from "./aiReport";
import { DEMO_GAMES, demoProbabilities, demoValue, type DemoGame } from "./demo";

/**
 * LEITURA do Centro de Jogos — só banco, nenhuma chamada de fornecedor.
 *
 * A tela nunca busca API: quem enche o banco é o `hub:sync` (cascata). Aqui
 * apenas juntamos fixture + última análise publicada + odd, e a UI decide o que
 * mostrar. Se o banco não responder ou ainda não tiver jogo na janela, devolve
 * a massa de demonstração com `demo: true` para a página não ficar em branco.
 */

export type HubProbabilities = { home: number; draw: number; away: number };

export type HubValueTag = {
  market: string;
  selection: string;
  probability: number;
  odds: number;
  value: number;
  isHotPick: boolean;
};

export type HubGame = {
  id: number;
  kickoff: Date;
  liveState: string;
  homeScore: number;
  awayScore: number;
  venueName: string | null;
  roundName: string | null;
  league: { id: number; name: string; country: string | null; isExperimental: boolean };
  home: { id: number; name: string; logoUrl: string | null; tablePosition: number | null };
  away: { id: number; name: string; logoUrl: string | null; tablePosition: number | null };
  probabilities: HubProbabilities | null;
  expectedGoals: number | null;
  xg: { home: number; away: number } | null;
  hasOdds: boolean;
  /** Só existe quando houve odd real E ev >= limiar. Sem odd, é `null`. */
  value: HubValueTag | null;
};

export type HubLeagueGroup = {
  id: number;
  name: string;
  country: string | null;
  isExperimental: boolean;
  games: HubGame[];
};

export type HubGamesResult = {
  groups: HubLeagueGroup[];
  demo: boolean;
  total: number;
  notice: string | null;
};

export type HubDetail = HubGame & {
  demo: boolean;
  analysisType: "Preview" | "Final" | null;
  confidence: number | null;
  analysisText: string | null;
  keyFactors: string[];
  riskFactors: string[];
  markets: Array<{ market: string; selection: string; probability: number }>;
  topScores: TopScore[];
  h2h: HubH2H | null;
  stats: HubMatchStats | null;
  contextSource: string | null;
  bestOdds: Array<{ selection: string; odds: number; bookmaker: string }>;
  /** Forma dos últimos 10 jogos encerrados: "V-E-D-V-D" (mais recente 1º). */
  forma: HubForma | null;
  /** xG do fornecedor ("real") ou do modelo Poisson ("estimado"). */
  xgSource: "real" | "estimado" | null;
  /**
   * Padrões estatísticos gravados na última análise ("The Lab"). Vazio quando o
   * motor não gerou padrão para este jogo — a UI avisa, não inventa.
   */
  labInsights: HubLabInsight[];
  /** Fatores que deslocam o xG de cada lado, como o motor gravou em `hub_xg_factor`. */
  xgFactors: Array<{ side: string; factorType: string; impact: number; weight: number; context: Record<string, unknown> | null }>;
  /**
   * Comparativo de odds entre casas (Pinnacle, Bet365, 1xBet e as demais que o
   * fornecedor mandou), por seleção. Vazio quando nenhuma casa cotou o jogo.
   */
  oddsMultiCasa: ComparativoSelecao[];
};

export type HubForma = {
  home: string;
  away: string;
  homeJogos: number;
  awayJogos: number;
};

const JANELA_PASSADO_MS = 4 * 60 * 60 * 1000;

const homeT = alias(hubTeam, "hub_home_team");
const awayT = alias(hubTeam, "hub_away_team");

type FixtureRow = {
  id: number;
  kickoff: Date;
  liveState: string;
  homeScore: number;
  awayScore: number;
  venueName: string | null;
  roundName: string | null;
  leagueId: number;
  leagueName: string;
  leagueCountry: string | null;
  leagueExperimental: boolean;
  homeId: number;
  homeName: string;
  homeLogo: string | null;
  homePos: number | null;
  awayId: number;
  awayName: string;
  awayLogo: string | null;
  awayPos: number | null;
};

const fixtureColumns = {
  id: hubFixture.id,
  kickoff: hubFixture.matchDate,
  liveState: hubFixture.liveState,
  homeScore: hubFixture.homeScore,
  awayScore: hubFixture.awayScore,
  venueName: hubFixture.venueName,
  roundName: hubFixture.roundName,
  leagueId: hubLeague.id,
  leagueName: hubLeague.name,
  leagueCountry: hubLeague.countryName,
  leagueExperimental: hubLeague.isExperimental,
  homeId: homeT.id,
  homeName: homeT.name,
  homeLogo: homeT.logoUrl,
  homePos: hubFixture.homeTablePosition,
  awayId: awayT.id,
  awayName: awayT.name,
  awayLogo: awayT.logoUrl,
  awayPos: hubFixture.awayTablePosition,
};

type AnalysisPick = {
  id: number;
  fixtureId: number;
  analysisType: string;
  version: number;
  summary: HubAnalysisSummary | null;
  confidence: number | null;
  analysisText: string;
  keyFactors: string[];
  riskFactors: string[];
  labInsights: HubLabInsight[];
  createdAt: Date;
};

/**
 * Última análise publicada por jogo: a de MAIOR VERSÃO ganha; empate fica com
 * `Final`. É a mesma regra do job (`preferirAnalise`), de propósito: quando a
 * tela e o job discordavam de qual análise era "a atual", a tela mostrava uma
 * degenerada antiga enquanto o job regerava a mesma fixture para sempre.
 */
async function latestAnalysesFor(fixtureIds: number[]): Promise<Map<number, AnalysisPick>> {
  const escolhidas = new Map<number, AnalysisPick>();
  if (!fixtureIds.length) return escolhidas;

  const rows = await db
    .select({
      id: hubAnalysis.id,
      fixtureId: hubAnalysis.fixtureId,
      analysisType: hubAnalysis.analysisType,
      version: hubAnalysis.version,
      summary: hubAnalysis.summary,
      confidence: hubAnalysis.confidence,
      analysisText: hubAnalysis.analysisText,
      keyFactors: hubAnalysis.keyFactors,
      riskFactors: hubAnalysis.riskFactors,
      labInsights: hubAnalysis.labInsights,
      createdAt: hubAnalysis.createdAt,
    })
    .from(hubAnalysis)
    .where(inArray(hubAnalysis.fixtureId, fixtureIds))
    .orderBy(desc(hubAnalysis.version), desc(hubAnalysis.createdAt));

  for (const row of rows) {
    if (row.analysisType !== "Preview" && row.analysisType !== "Final") continue;
    escolhidas.set(row.fixtureId, preferirAnalise(escolhidas.get(row.fixtureId), row));
  }
  return escolhidas;
}

function probabilidades1x2(rows: Array<{ selection: string; probability: number }>): HubProbabilities | null {
  const home = rows.find((r) => r.selection === "Home")?.probability;
  const draw = rows.find((r) => r.selection === "Draw")?.probability;
  const away = rows.find((r) => r.selection === "Away")?.probability;
  if (home == null || draw == null || away == null) return null;
  return { home, draw, away };
}

function ordenarPorLiga(rows: HubGame[]): HubLeagueGroup[] {
  const porLiga = new Map<number, HubLeagueGroup>();
  for (const g of rows) {
    const atual = porLiga.get(g.league.id);
    if (atual) atual.games.push(g);
    else porLiga.set(g.league.id, { ...g.league, games: [g] });
  }
  return [...porLiga.values()].sort((a, b) => b.games.length - a.games.length || a.name.localeCompare(b.name));
}

/* =============================== demonstração =============================== */

function demoGameToHub(game: DemoGame, agora: number): HubGame {
  const p = demoProbabilities(game.xg);
  const valor = demoValue(game);
  return {
    id: game.id,
    kickoff: new Date(agora + game.kickoffOffsetMin * 60_000),
    liveState: game.liveState,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    venueName: game.venue,
    roundName: game.roundName,
    league: { ...game.league },
    home: { ...game.home },
    away: { ...game.away },
    probabilities: { home: p.home, draw: p.draw, away: p.away },
    expectedGoals: Number((game.xg.home + game.xg.away).toFixed(2)),
    xg: { ...game.xg },
    hasOdds: Boolean(game.odds),
    value: valor
      ? {
          market: "1X2",
          selection: valor.selection,
          probability: valor.probability,
          odds: valor.odds,
          value: valor.value,
          isHotPick: valor.value >= 0.12 && valor.probability >= 0.5,
        }
      : null,
  };
}

function demoGroups(): HubLeagueGroup[] {
  const agora = Date.now();
  return ordenarPorLiga(DEMO_GAMES.map((g) => demoGameToHub(g, agora)));
}

export type HubInsightsCache = {
  /** Fixture interna encontrada a partir do id da ESPN (`null` = jogo não sincronizado). */
  fixtureId: number | null;
  labInsights: HubLabInsight[];
  xgFactors: HubDetail["xgFactors"];
  xg: { home: number; away: number } | null;
  analise: { tipo: "Preview" | "Final"; atualizadoEm: string } | null;
  /** Relatório em linguagem natural montado do MESMO cache (custo zero). */
  relatorio: RelatorioIA | null;
};

const SEM_INSIGHTS: HubInsightsCache = { fixtureId: null, labInsights: [], xgFactors: [], xg: null, analise: null, relatorio: null };

/**
 * Ponte de identidade: id do evento na ESPN -> fixture interna do Hub.
 *
 * A tela `/jogos/[id]` trabalha com o id do evento na ESPN, enquanto o Hub
 * guarda a fixture com id próprio. A identidade canônica é
 * `hub_fixture_source.(provider, external_id)`, com fallback para
 * `hub_fixture.(source, external_ref)`. Só banco, nenhum fornecedor.
 */
export async function fixtureIdPorEspnId(idBruto: string): Promise<number | null> {
  const id = String(idBruto ?? "").trim();
  if (!id) return null;

  const [porFonte] = await db
    .select({ fixtureId: hubFixtureSource.fixtureId })
    .from(hubFixtureSource)
    .where(and(eq(hubFixtureSource.provider, "espn"), eq(hubFixtureSource.externalId, id)))
    .limit(1);
  if (porFonte?.fixtureId != null) return porFonte.fixtureId;

  const [porRef] = await db
    .select({ id: hubFixture.id })
    .from(hubFixture)
    .where(and(eq(hubFixture.source, "espn"), eq(hubFixture.externalRef, id)))
    .limit(1);
  return porRef?.id ?? null;
}

/**
 * Padrões e fatores de xG de um jogo da ESPN, só com o que já está no banco.
 *
 * Nenhuma chamada de fornecedor: se o jogo não foi sincronizado, devolve vazio
 * e a UI diz que o dado está indisponível.
 */
export async function hubInsightsPorEspnId(externalId: string): Promise<HubInsightsCache> {
  try {
    const fixtureId = await fixtureIdPorEspnId(externalId);
    if (fixtureId == null) return SEM_INSIGHTS;

    const analise = (await latestAnalysesFor([fixtureId])).get(fixtureId) ?? null;
    if (!analise) return { ...SEM_INSIGHTS, fixtureId };

    /**
     * Tudo o que o relatório precisa sai das tabelas que o sync já encheu: nada
     * de fornecedor. Rodamos as leituras em paralelo para a Pré-Live não somar
     * latência em série.
     */
    const [fatores, predicoes, placares, valor, fixtureRow, contexto] = await Promise.all([
      db
        .select({
          side: hubXgFactor.side,
          factorType: hubXgFactor.factorType,
          impact: hubXgFactor.impact,
          weight: hubXgFactor.weight,
          context: hubXgFactor.context,
        })
        .from(hubXgFactor)
        .where(eq(hubXgFactor.analysisId, analise.id)),
      db
        .select({ market: hubPredictionRow.market, selection: hubPredictionRow.selection, probability: hubPredictionRow.probability })
        .from(hubPredictionRow)
        .where(eq(hubPredictionRow.analysisId, analise.id)),
      db
        .select({ home: hubTopScore.home, away: hubTopScore.away, probability: hubTopScore.probability })
        .from(hubTopScore)
        .where(eq(hubTopScore.analysisId, analise.id))
        .orderBy(desc(hubTopScore.probability))
        .limit(5),
      db.select().from(hubValueBet).where(eq(hubValueBet.analysisId, analise.id)).limit(1),
      db
        .select({
          id: hubFixture.id,
          homeTeamId: hubFixture.homeTeamId,
          awayTeamId: hubFixture.awayTeamId,
          kickoff: hubFixture.matchDate,
          homeName: homeT.name,
          awayName: awayT.name,
        })
        .from(hubFixture)
        .innerJoin(homeT, eq(homeT.id, hubFixture.homeTeamId))
        .innerJoin(awayT, eq(awayT.id, hubFixture.awayTeamId))
        .where(eq(hubFixture.id, fixtureId))
        .limit(1),
      db.select({ h2h: hubFixtureContext.h2h, stats: hubFixtureContext.stats }).from(hubFixtureContext).where(eq(hubFixtureContext.fixtureId, fixtureId)).limit(1),
    ]);

    const f = fixtureRow[0] ?? null;
    const apostaValor = valor[0] ?? null;
    const ctxRow = contexto[0] ?? null;
    /* xG "real" é o publicado no contexto pelo fornecedor; o do resumo é estimado
       pelo modelo. Mesma regra da tela do Hub, para o texto não trocar a fonte. */
    const xgCtx = xgDoContexto(ctxRow?.stats ?? null);
    const xg = xgCtx ?? (analise.summary ? { home: analise.summary.xgHome, away: analise.summary.xgAway } : null);
    const xgSource: "real" | "estimado" | null = xgCtx ? "real" : analise.summary ? "estimado" : null;

    /* Forma recente (mesma função da tela do Hub) + casas da seleção com valor,
       para o relatório citar o preço da Pinnacle quando ela cotou. */
    const [forma, casasDoValor] = await Promise.all([
      f ? formasRecentes(f.homeTeamId, f.awayTeamId, f.kickoff) : Promise.resolve(null),
      apostaValor
        ? db
            .select({
              market: hubBookmakerOdd.market,
              selection: hubBookmakerOdd.selection,
              odds: hubBookmakerOdd.odds,
              bookmaker: hubBookmakerOdd.bookmaker,
              bookmakerSlug: hubBookmakerOdd.bookmakerSlug,
              isPick: hubBookmakerOdd.isPick,
            })
            .from(hubBookmakerOdd)
            .where(
              and(
                eq(hubBookmakerOdd.fixtureId, fixtureId),
                eq(hubBookmakerOdd.market, apostaValor.market),
                eq(hubBookmakerOdd.selection, apostaValor.selection),
              ),
            )
        : Promise.resolve([] as Array<{ market: string; selection: string; odds: number; bookmaker: string; bookmakerSlug: string; isPick: boolean }>),
    ]);

    const indiceValor: OddsIndex = {};
    for (const o of casasDoValor) {
      if (!Number.isFinite(o.odds) || o.odds <= 1.01) continue;
      (indiceValor[`${o.market}|${o.selection}`] ??= []).push({
        bookmaker: o.bookmaker,
        bookmakerSlug: o.bookmakerSlug,
        odds: o.odds,
        isPick: o.isPick,
      });
    }

    const relatorio =
      f == null
        ? null
        : gerarRelatorio({
            home: f.homeName,
            away: f.awayName,
            probabilities: probabilidades1x2(predicoes.filter((p) => p.market === "1X2")),
            expectedGoals: analise.summary?.expectedTotalGoals ?? null,
            xg,
            xgSource,
            markets: predicoes,
            topScores: placares,
            value: apostaValor
              ? {
                  market: apostaValor.market,
                  selection: apostaValor.selection,
                  probability: apostaValor.probability,
                  odds: apostaValor.odds,
                  value: apostaValor.value,
                }
              : null,
            hasOdds: analise.summary?.hasOdds ?? casasDoValor.length > 0,
            h2h: ctxRow?.h2h ?? null,
            forma: forma ? { home: forma.home, away: forma.away } : null,
            confidence: analise.confidence,
            riskFactors: analise.riskFactors,
            oddsMultiCasa: compararCasas(
              indiceValor,
              apostaValor ? [{ market: apostaValor.market, selection: apostaValor.selection }] : [],
            ),
          });

    return {
      fixtureId,
      labInsights: analise.labInsights ?? [],
      xgFactors: fatores.map((i) => ({ ...i, context: (i.context ?? null) as Record<string, unknown> | null })),
      xg,
      analise: {
        tipo: analise.analysisType as "Preview" | "Final",
        atualizadoEm: analise.createdAt.toISOString(),
      },
      relatorio,
    };
  } catch {
    // Banco fora não pode derrubar a Pré-Live: a tela cai no "indisponível".
    return SEM_INSIGHTS;
  }
}

export type HubOddsMultiCasa = {
  /** Fixture interna encontrada a partir do id da ESPN (`null` = não sincronizado). */
  fixtureId: number | null;
  comparativos: ComparativoSelecao[];
  /** Casas diferentes que cotaram o jogo (contagem real, sem corte de exibição). */
  totalCasas: number;
};

/**
 * Comparativo de odds multi-casa do jogo da ESPN informado — só cache do banco.
 *
 * O comparativo é o mesmo que a tela `/hub/[id]` monta (`compararCasas`): a
 * ingestão da Sportmonks já grava Pinnacle, Bet365, 1xBet e as demais casas que
 * vierem no payload; aqui só lemos e ordenamos.
 */
export async function hubOddsPorEspnId(externalId: string): Promise<HubOddsMultiCasa> {
  const vazio: HubOddsMultiCasa = { fixtureId: null, comparativos: [], totalCasas: 0 };
  try {
    const fixtureId = await fixtureIdPorEspnId(externalId);
    if (fixtureId == null) return vazio;

    const rows = await db
      .select({
        market: hubBookmakerOdd.market,
        selection: hubBookmakerOdd.selection,
        odds: hubBookmakerOdd.odds,
        bookmaker: hubBookmakerOdd.bookmaker,
        bookmakerSlug: hubBookmakerOdd.bookmakerSlug,
        isPick: hubBookmakerOdd.isPick,
      })
      .from(hubBookmakerOdd)
      .where(eq(hubBookmakerOdd.fixtureId, fixtureId));

    const indice: OddsIndex = {};
    const casas = new Set<string>();
    for (const o of rows) {
      if (!Number.isFinite(o.odds) || o.odds <= 1.01) continue;
      casas.add(o.bookmakerSlug || o.bookmaker);
      (indice[`${o.market}|${o.selection}`] ??= []).push({
        bookmaker: o.bookmaker,
        bookmakerSlug: o.bookmakerSlug,
        odds: o.odds,
        isPick: o.isPick,
      });
    }

    return { fixtureId, comparativos: compararCasas(indice, SELECOES_COMPARATIVO), totalCasas: casas.size };
  } catch {
    return vazio;
  }
}

/* ================================== listas ================================== */

export async function hubGames(dias = 3): Promise<HubGamesResult> {
  const from = new Date(Date.now() - JANELA_PASSADO_MS);
  const to = new Date(Date.now() + dias * 86_400_000);

  try {
    const rows = (await db
      .select(fixtureColumns)
      .from(hubFixture)
      .innerJoin(hubLeague, eq(hubLeague.id, hubFixture.leagueId))
      .innerJoin(homeT, eq(homeT.id, hubFixture.homeTeamId))
      .innerJoin(awayT, eq(awayT.id, hubFixture.awayTeamId))
      .where(and(gte(hubFixture.matchDate, from), lte(hubFixture.matchDate, to)))
      .orderBy(asc(hubFixture.matchDate))
      .limit(150)) as FixtureRow[];

    if (!rows.length) {
      return {
        groups: demoGroups(),
        demo: true,
        total: DEMO_GAMES.length,
        notice: "Nenhum jogo na janela de 3 dias no banco. Exibindo massa de demonstração com o mesmo motor Poisson.",
      };
    }

    const ids = rows.map((r) => r.id);
    const analises = await latestAnalysesFor(ids);
    const analiseIds = [...analises.values()].map((a) => a.id);

    const [predicoes, valores, comOdd] = await Promise.all([
      analiseIds.length
        ? db
            .select({ analysisId: hubPredictionRow.analysisId, selection: hubPredictionRow.selection, probability: hubPredictionRow.probability })
            .from(hubPredictionRow)
            .where(and(inArray(hubPredictionRow.analysisId, analiseIds), eq(hubPredictionRow.market, "1X2")))
        : Promise.resolve([] as Array<{ analysisId: number; selection: string; probability: number }>),
      analiseIds.length
        ? db
            .select({
              analysisId: hubValueBet.analysisId,
              market: hubValueBet.market,
              selection: hubValueBet.selection,
              probability: hubValueBet.probability,
              odds: hubValueBet.odds,
              value: hubValueBet.value,
              isHotPick: hubValueBet.isHotPick,
            })
            .from(hubValueBet)
            .where(inArray(hubValueBet.analysisId, analiseIds))
        : Promise.resolve([] as Array<{ analysisId: number; market: string; selection: string; probability: number; odds: number; value: number; isHotPick: boolean }>),
      db
        .selectDistinct({ fixtureId: hubBookmakerOdd.fixtureId })
        .from(hubBookmakerOdd)
        .where(and(inArray(hubBookmakerOdd.fixtureId, ids), gt(hubBookmakerOdd.odds, 1.01))),
    ]);

    const porAnalise = new Map<number, Array<{ selection: string; probability: number }>>();
    for (const p of predicoes) {
      const atual = porAnalise.get(p.analysisId);
      if (atual) atual.push({ selection: p.selection, probability: p.probability });
      else porAnalise.set(p.analysisId, [{ selection: p.selection, probability: p.probability }]);
    }
    const valorPorAnalise = new Map(valores.map((v) => [v.analysisId, v]));
    const temOdd = new Set(comOdd.map((r) => r.fixtureId));

    const games: HubGame[] = rows.map((r) => {
      const analise = analises.get(r.id) ?? null;
      const probabilidades = analise ? probabilidades1x2(porAnalise.get(analise.id) ?? []) : null;
      const valor = analise ? valorPorAnalise.get(analise.id) ?? null : null;
      const summary = analise?.summary ?? null;
      const hasOdds = summary?.hasOdds ?? temOdd.has(r.id);

      return {
        id: r.id,
        kickoff: r.kickoff,
        liveState: r.liveState,
        homeScore: r.homeScore,
        awayScore: r.awayScore,
        venueName: r.venueName,
        roundName: r.roundName,
        league: { id: r.leagueId, name: r.leagueName, country: r.leagueCountry, isExperimental: r.leagueExperimental },
        home: { id: r.homeId, name: r.homeName, logoUrl: r.homeLogo, tablePosition: r.homePos },
        away: { id: r.awayId, name: r.awayName, logoUrl: r.awayLogo, tablePosition: r.awayPos },
        probabilities: probabilidades,
        expectedGoals: summary ? summary.expectedTotalGoals : null,
        xg: summary ? { home: summary.xgHome, away: summary.xgAway } : null,
        hasOdds,
        // Sem odd real não existe tag de Valor — nem odd inventada.
        value: hasOdds && valor ? { ...valor } : null,
      };
    });

    return { groups: ordenarPorLiga(games), demo: false, total: games.length, notice: null };
  } catch (e) {
    return {
      groups: demoGroups(),
      demo: true,
      total: DEMO_GAMES.length,
      notice: `Banco indisponível (${String((e as Error)?.message || e).slice(0, 120)}). Exibindo massa de demonstração.`,
    };
  }
}

/* ================================== detalhe ================================= */

/**
 * Forma recente REAL dos dois times: últimos 10 jogos encerrados antes deste
 * confronto, do mais recente para o mais antigo. Só banco — sem estimativa.
 */
async function formasRecentes(homeId: number, awayId: number, before: Date): Promise<HubForma | null> {
  try {
    const rows = await db
      .select({
        homeTeamId: hubFixture.homeTeamId,
        awayTeamId: hubFixture.awayTeamId,
        homeScore: hubFixture.homeScoreFt,
        awayScore: hubFixture.awayScoreFt,
      })
      .from(hubFixture)
      .where(
        and(
          inArray(hubFixture.liveState, ["FT", "AET", "PEN"]),
          lt(hubFixture.matchDate, before),
          or(
            inArray(hubFixture.homeTeamId, [homeId, awayId]),
            inArray(hubFixture.awayTeamId, [homeId, awayId]),
          ),
        ),
      )
      .orderBy(desc(hubFixture.matchDate))
      .limit(80);

    const daCasa: string[] = [];
    const deFora: string[] = [];
    for (const r of rows) {
      const resultado = (teamId: number) => {
        const emCasa = r.homeTeamId === teamId;
        const gf = emCasa ? r.homeScore : r.awayScore;
        const ga = emCasa ? r.awayScore : r.homeScore;
        return gf > ga ? "V" : gf === ga ? "E" : "D";
      };
      if ((r.homeTeamId === homeId || r.awayTeamId === homeId) && daCasa.length < 10) daCasa.push(resultado(homeId));
      if ((r.homeTeamId === awayId || r.awayTeamId === awayId) && deFora.length < 10) deFora.push(resultado(awayId));
      if (daCasa.length >= 10 && deFora.length >= 10) break;
    }

    if (!daCasa.length && !deFora.length) return null;
    return { home: daCasa.join(""), away: deFora.join(""), homeJogos: daCasa.length, awayJogos: deFora.length };
  } catch {
    return null;
  }
}

/** xG publicado pelo fornecedor no contexto da partida ("real"), se existir. */
function xgDoContexto(stats: HubMatchStats | null): { home: number; away: number } | null {
  if (!stats) return null;
  for (const [label, v] of Object.entries(stats)) {
    if (!/x\s*g|expected\s*goals|gols\s*esperados/i.test(label)) continue;
    const h = typeof v.home === "number" ? v.home : Number(String(v.home ?? "").replace(",", ".").replace(/[^0-9.-]/g, ""));
    const a = typeof v.away === "number" ? v.away : Number(String(v.away ?? "").replace(",", ".").replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(h) && Number.isFinite(a)) return { home: h, away: a };
  }
  return null;
}

function demoDetail(id: number): HubDetail | null {
  const game = DEMO_GAMES.find((g) => g.id === id);
  if (!game) return null;
  const base = demoGameToHub(game, Date.now());
  const p = demoProbabilities(game.xg);
  const h2h: HubH2H = {
    matches: 5,
    homeWins: 2,
    draws: 1,
    awayWins: 2,
    avgTotalGoals: 2.6,
    recent: [
      { date: null, home: game.home.name, away: game.away.name, homeScore: 2, awayScore: 1 },
      { date: null, home: game.away.name, away: game.home.name, homeScore: 1, awayScore: 1 },
      { date: null, home: game.home.name, away: game.away.name, homeScore: 0, awayScore: 2 },
    ],
  };
  const stats: HubMatchStats = {
    "Posse de bola": { home: "54%", away: "46%" },
    "Finalizações": { home: 13, away: 9 },
    "No alvo": { home: 5, away: 3 },
    Escanteios: { home: 6, away: 4 },
    Faltas: { home: 11, away: 14 },
  };

  return {
    ...base,
    demo: true,
    analysisType: "Preview",
    confidence: 62,
    analysisText: null,
    keyFactors: [
      `${game.home.name} cria mais xG em casa (${game.xg.home.toFixed(2)})`,
      `${game.away.name} concede em média 1.2 gol fora`,
    ],
    riskFactors: ["Escalação ainda não confirmada"],
    markets: p.markets,
    topScores: p.topScores,
    h2h,
    stats,
    contextSource: "demo",
    bestOdds: game.odds
      ? [
          { selection: "Home", odds: game.odds.home, bookmaker: "Pinnacle" },
          { selection: "Draw", odds: game.odds.draw, bookmaker: "Pinnacle" },
          { selection: "Away", odds: game.odds.away, bookmaker: "Pinnacle" },
        ]
      : [],
    // Jogo de demonstração: não há histórico real por trás, então não inventamos forma.
    forma: null,
    xgSource: "estimado",
    // Sem análise gravada também não há fator nem padrão: a UI mostra "indisponível".
    labInsights: [],
    xgFactors: [],
    // Odds de exemplo da massa de demonstração não viram comparativo de casas.
    oddsMultiCasa: [],
  };
}

export async function hubGameDetail(id: number): Promise<HubDetail | null> {
  // Id negativo = massa de demonstração: nem toca no banco.
  if (id < 0) return demoDetail(id);

  try {
    const [row] = (await db
      .select(fixtureColumns)
      .from(hubFixture)
      .innerJoin(hubLeague, eq(hubLeague.id, hubFixture.leagueId))
      .innerJoin(homeT, eq(homeT.id, hubFixture.homeTeamId))
      .innerJoin(awayT, eq(awayT.id, hubFixture.awayTeamId))
      .where(eq(hubFixture.id, id))
      .limit(1)) as FixtureRow[];
    if (!row) return null;

    const [analises, contexto, forma] = await Promise.all([
      latestAnalysesFor([row.id]),
      db.select().from(hubFixtureContext).where(eq(hubFixtureContext.fixtureId, row.id)).limit(1),
      formasRecentes(row.homeId, row.awayId, row.kickoff),
    ]);
    const analise = analises.get(row.id) ?? null;

    /** Fatores de xG da mesma análise que gerou as probabilidades. */
    const fatores: HubDetail["xgFactors"] = analise
      ? await db
          .select({
            side: hubXgFactor.side,
            factorType: hubXgFactor.factorType,
            impact: hubXgFactor.impact,
            weight: hubXgFactor.weight,
            context: hubXgFactor.context,
          })
          .from(hubXgFactor)
          .where(eq(hubXgFactor.analysisId, analise.id))
      : [];

    const [predicoes, placares, valor, odds] = await Promise.all([
      analise
        ? db
            .select({ market: hubPredictionRow.market, selection: hubPredictionRow.selection, probability: hubPredictionRow.probability })
            .from(hubPredictionRow)
            .where(eq(hubPredictionRow.analysisId, analise.id))
        : Promise.resolve([] as Array<{ market: string; selection: string; probability: number }>),
      analise
        ? db
            .select({ home: hubTopScore.home, away: hubTopScore.away, probability: hubTopScore.probability })
            .from(hubTopScore)
            .where(eq(hubTopScore.analysisId, analise.id))
            .orderBy(desc(hubTopScore.probability))
            .limit(5)
        : Promise.resolve([] as TopScore[]),
      analise
        ? db.select().from(hubValueBet).where(eq(hubValueBet.analysisId, analise.id)).limit(1)
        : Promise.resolve([]),
      db
        .select({
          market: hubBookmakerOdd.market,
          selection: hubBookmakerOdd.selection,
          odds: hubBookmakerOdd.odds,
          bookmaker: hubBookmakerOdd.bookmaker,
          bookmakerSlug: hubBookmakerOdd.bookmakerSlug,
          isPick: hubBookmakerOdd.isPick,
        })
        .from(hubBookmakerOdd)
        .where(eq(hubBookmakerOdd.fixtureId, row.id))
        .orderBy(desc(hubBookmakerOdd.odds)),
    ]);

    /* Índice "mercado|seleção" -> todas as casas que cotaram, como o motor lê. */
    const indiceOdds: OddsIndex = {};
    for (const o of odds) {
      if (!Number.isFinite(o.odds) || o.odds <= 1.01) continue;
      (indiceOdds[`${o.market}|${o.selection}`] ??= []).push({
        bookmaker: o.bookmaker,
        bookmakerSlug: o.bookmakerSlug,
        odds: o.odds,
        isPick: o.isPick,
      });
    }

    const melhor = new Map<string, { selection: string; odds: number; bookmaker: string }>();
    for (const o of odds) {
      if (o.market !== "1X2") continue;
      if (!Number.isFinite(o.odds) || o.odds <= 1.01) continue;
      if (!melhor.has(o.selection)) melhor.set(o.selection, o);
    }

    const sum = analise?.summary ?? null;
    const value = valor[0] ?? null;
    const hasOdds = sum?.hasOdds ?? melhor.size > 0;
    const ctx = contexto[0] ?? null;
    const xgReal = xgDoContexto(ctx?.stats ?? null);

    return {
      id: row.id,
      kickoff: row.kickoff,
      liveState: row.liveState,
      homeScore: row.homeScore,
      awayScore: row.awayScore,
      venueName: row.venueName,
      roundName: row.roundName,
      league: { id: row.leagueId, name: row.leagueName, country: row.leagueCountry, isExperimental: row.leagueExperimental },
      home: { id: row.homeId, name: row.homeName, logoUrl: row.homeLogo, tablePosition: row.homePos },
      away: { id: row.awayId, name: row.awayName, logoUrl: row.awayLogo, tablePosition: row.awayPos },
      probabilities: probabilidades1x2(predicoes.filter((p) => p.market === "1X2")),
      expectedGoals: sum?.expectedTotalGoals ?? null,
      xg: xgReal ?? (sum ? { home: sum.xgHome, away: sum.xgAway } : null),
      xgSource: xgReal ? "real" : sum ? "estimado" : null,
      hasOdds,
      value: hasOdds && value ? { ...value } : null,
      demo: false,
      analysisType: analise ? (analise.analysisType as "Preview" | "Final") : null,
      confidence: analise?.confidence ?? null,
      analysisText: analise?.analysisText?.trim() ? analise.analysisText : null,
      keyFactors: analise?.keyFactors ?? [],
      riskFactors: analise?.riskFactors ?? [],
      markets: predicoes,
      topScores: placares,
      h2h: ctx?.h2h ?? null,
      stats: ctx?.stats ?? null,
      contextSource: ctx?.source ?? null,
      bestOdds: [...melhor.values()],
      forma,
      labInsights: analise?.labInsights ?? [],
      xgFactors: fatores.map((f) => ({ ...f, context: (f.context ?? null) as Record<string, unknown> | null })),
      oddsMultiCasa: compararCasas(indiceOdds, SELECOES_COMPARATIVO),
    };
  } catch {
    // Banco fora: se o id existe na massa de demonstração, ainda abrimos a tela.
    return demoDetail(id);
  }
}
