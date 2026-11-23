import { and, desc, eq, inArray, lt, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  hubAnalysis,
  hubBookmakerOdd,
  hubFixture,
  hubLeague,
  hubLineup,
  hubLineupPlayer,
  hubOpportunity,
  hubPlayer,
  hubPlayerStat,
  hubPredictionRow,
  hubTeam,
  hubTopScore,
  hubValueBet,
  hubXgFactor,
} from "@/db/hub-schema";
import {
  amostraUtilizavel,
  ESTADOS_FINALIZADOS,
  mediaLiga,
  MEDIA_LIGA_PADRAO,
  MEDIA_MANDANTE_PADRAO,
  resumoDeGenerado,
} from "./amostra";
import { pickOpportunity, runHubModel, type MatchSample, type OddsIndex, type SquadPlayer, type TeamInput } from "./model";

/**
 * Orquestração: banco -> motor -> banco.
 *
 * Princípios:
 *  - `Preview` pode ser gerada a qualquer momento e não cria oportunidade.
 *  - `Final` exige lineup confirmado dos dois lados (é o que o produto promete)
 *    e é a ÚNICA análise que cria linha em `hub_opportunity`.
 *  - Publicar de novo cria versão nova; nada é sobrescrito.
 */

const PREVIEW_WINDOW_HOURS = 48;
const FINAL_WINDOW_MINUTES = 60;

export type BuildContext = { fixtureId: number; generated: "preview" | "final" };

async function recentMatches(teamId: number, before: Date, limit = 12): Promise<MatchSample[]> {
  const homeT = alias(hubTeam, "home_team_recent");
  const awayT = alias(hubTeam, "away_team_recent");

  const rows = await db
    .select({
      date: hubFixture.matchDate,
      homeScore: hubFixture.homeScoreFt,
      awayScore: hubFixture.awayScoreFt,
      homeName: homeT.name,
      awayName: awayT.name,
    })
    .from(hubFixture)
    .innerJoin(homeT, eq(homeT.id, hubFixture.homeTeamId))
    .innerJoin(awayT, eq(awayT.id, hubFixture.awayTeamId))
    .where(
      and(
        inArray(hubFixture.liveState, [...ESTADOS_FINALIZADOS]),
        lt(hubFixture.matchDate, before),
        eq(hubFixture.homeTeamId, teamId),
      ),
    )
    .orderBy(desc(hubFixture.matchDate))
    .limit(limit);

  const awayRows = await db
    .select({
      date: hubFixture.matchDate,
      homeScore: hubFixture.homeScoreFt,
      awayScore: hubFixture.awayScoreFt,
      homeName: homeT.name,
      awayName: awayT.name,
    })
    .from(hubFixture)
    .innerJoin(homeT, eq(homeT.id, hubFixture.homeTeamId))
    .innerJoin(awayT, eq(awayT.id, hubFixture.awayTeamId))
    .where(
      and(
        inArray(hubFixture.liveState, [...ESTADOS_FINALIZADOS]),
        lt(hubFixture.matchDate, before),
        eq(hubFixture.awayTeamId, teamId),
      ),
    )
    .orderBy(desc(hubFixture.matchDate))
    .limit(limit);

  const home: MatchSample[] = rows.map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    opponent: r.awayName,
    location: "Home" as const,
    goalsFor: r.homeScore,
    goalsAgainst: r.awayScore,
  }));
  const away: MatchSample[] = awayRows.map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    opponent: r.homeName,
    location: "Away" as const,
    goalsFor: r.awayScore,
    goalsAgainst: r.homeScore,
  }));

  return [...home, ...away].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, limit);
}

async function squadFor(fixtureId: number, teamId: number, seasonId: number | null): Promise<SquadPlayer[]> {
  const rows = await db
    .select({
      playerId: hubLineupPlayer.playerId,
      role: hubLineupPlayer.role,
      name: hubPlayer.name,
    })
    .from(hubLineupPlayer)
    .leftJoin(hubPlayer, eq(hubPlayer.id, hubLineupPlayer.playerId))
    .where(and(eq(hubLineupPlayer.fixtureId, fixtureId), eq(hubLineupPlayer.teamId, teamId)));

  if (!rows.length) return [];
  const ids = rows.map((r) => r.playerId).filter((v): v is number => v != null);
  if (!ids.length) return [];

  const stats = seasonId
    ? await db
        .select({
          playerId: hubPlayerStat.playerId,
          goals: hubPlayerStat.goals,
          assists: hubPlayerStat.assists,
          minutes: hubPlayerStat.minutes,
        })
        .from(hubPlayerStat)
        .where(and(inArray(hubPlayerStat.playerId, ids), eq(hubPlayerStat.seasonId, seasonId)))
    : [];

  const statMap = new Map(stats.map((s) => [s.playerId, s]));
  return rows
    .filter((r) => r.playerId != null)
    .map((r) => {
      const stat = statMap.get(r.playerId as number);
      return {
        playerId: r.playerId as number,
        name: String(r.name ?? r.playerId),
        role: r.role as SquadPlayer["role"],
        goals: stat?.goals ?? 0,
        assists: stat?.assists ?? 0,
        minutes: stat?.minutes ?? 0,
      };
    });
}

/**
 * Média de gols da liga — insumo do motor quando o time não tem histórico.
 *
 * Duas armadilhas que já produziram análise degenerada:
 *  1. liga sem jogo finalizado caía no piso 0,6/0,6 e rebaixava o xG de TODO
 *     jogo da competição ao mesmo valor (o `Math.max(0.6, ...)` antigo);
 *  2. `live_state = 'FT'` ignorava prorrogação e pênaltis.
 * Agora média sem amostra confiável é `null` e vira o padrão neutro.
 */
async function leagueGoalAvg(leagueId: number, before: Date): Promise<{ perTeam: number; homeAvg: number }> {
  const rows = await db
    .select({ homeScore: hubFixture.homeScoreFt, awayScore: hubFixture.awayScoreFt })
    .from(hubFixture)
    .where(
      and(
        eq(hubFixture.leagueId, leagueId),
        lt(hubFixture.matchDate, before),
        inArray(hubFixture.liveState, [...ESTADOS_FINALIZADOS]),
      ),
    )
    .limit(400);

  const jogos = rows.length;
  const totalGols = rows.reduce((s, r) => s + (r.homeScore ?? 0) + (r.awayScore ?? 0), 0);
  const golsMandante = rows.reduce((s, r) => s + (r.homeScore ?? 0), 0);

  return {
    perTeam: mediaLiga(totalGols, jogos * 2) ?? MEDIA_LIGA_PADRAO,
    homeAvg: mediaLiga(golsMandante, jogos) ?? MEDIA_MANDANTE_PADRAO,
  };
}

async function oddsIndex(fixtureId: number): Promise<OddsIndex> {
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
  const index: OddsIndex = {};
  for (const r of rows) {
    const key = `${r.market}|${r.selection}`;
    (index[key] ??= []).push({
      bookmaker: r.bookmaker,
      bookmakerSlug: r.bookmakerSlug,
      odds: r.odds,
      isPick: r.isPick,
    });
  }
  return index;
}

/** Monta o contexto do motor para uma fixture já sincronizada. */
export async function buildModelInputs(fixtureId: number): Promise<{ home: TeamInput; away: TeamInput; isExperimental: boolean }> {
  const [fixture] = await db
    .select({
      id: hubFixture.id,
      matchDate: hubFixture.matchDate,
      homeTeamId: hubFixture.homeTeamId,
      awayTeamId: hubFixture.awayTeamId,
      homeTablePosition: hubFixture.homeTablePosition,
      awayTablePosition: hubFixture.awayTablePosition,
      leagueId: hubFixture.leagueId,
      seasonId: hubFixture.seasonId,
      homeName: hubTeam.name,
      leagueExperimental: hubLeague.isExperimental,
    })
    .from(hubFixture)
    .innerJoin(hubTeam, eq(hubTeam.id, hubFixture.homeTeamId))
    .innerJoin(hubLeague, eq(hubLeague.id, hubFixture.leagueId))
    .where(eq(hubFixture.id, fixtureId))
    .limit(1);
  if (!fixture) throw new Error(`Fixture ${fixtureId} não encontrada.`);

  const [awayTeam] = await db
    .select({ name: hubTeam.name })
    .from(hubTeam)
    .where(eq(hubTeam.id, fixture.awayTeamId))
    .limit(1);

  const league = await leagueGoalAvg(fixture.leagueId, fixture.matchDate);

  const [homeSquad, awaySquad, homeMatches, awayMatches] = await Promise.all([
    squadFor(fixtureId, fixture.homeTeamId, fixture.seasonId),
    squadFor(fixtureId, fixture.awayTeamId, fixture.seasonId),
    recentMatches(fixture.homeTeamId, fixture.matchDate),
    recentMatches(fixture.awayTeamId, fixture.matchDate),
  ]);

  return {
    home: {
      teamId: fixture.homeTeamId,
      teamName: fixture.homeName,
      matches: homeMatches,
      leagueGoalAvg: league.perTeam,
      leagueHomeGoalAvg: league.homeAvg,
      tablePosition: fixture.homeTablePosition,
      squad: homeSquad,
    },
    away: {
      teamId: fixture.awayTeamId,
      teamName: awayTeam?.name ?? "Away",
      matches: awayMatches,
      leagueGoalAvg: league.perTeam,
      leagueHomeGoalAvg: league.homeAvg,
      tablePosition: fixture.awayTablePosition,
      squad: awaySquad,
    },
    isExperimental: fixture.leagueExperimental,
  };
}

/** Só libera Final quando há XI confirmado dos dois lados. */
export async function lineupsConfirmed(fixtureId: number): Promise<boolean> {
  const [row] = await db.select({ confirmed: hubLineup.confirmed }).from(hubLineup).where(eq(hubLineup.fixtureId, fixtureId)).limit(1);
  return Boolean(row?.confirmed);
}

export async function generateAnalysis(fixtureId: number, kind: "Preview" | "Final"): Promise<{ analysisId: number; opportunityId: number | null }> {
  if (kind === "Final" && !(await lineupsConfirmed(fixtureId))) {
    throw new Error("Análise final exige escalação confirmada dos dois times.");
  }

  const [{ home, away, isExperimental }, odds] = await Promise.all([buildModelInputs(fixtureId), oddsIndex(fixtureId)]);

  /**
   * PORTÃO DA AMOSTRA — o bug da "análise igual para todos os jogos da liga".
   *
   * Sem jogo finalizado de nenhum dos dois lados, `runHubModel` devolve a média
   * da liga pura: o MESMO vetor para todo jogo da competição. Isso não é
   * análise, é constante — então não é publicada (o job conta como skipped e a
   * UI mostra "em preparação" em vez de um número que não é daquele jogo).
   */
  const amostras = { home: home.matches.length, away: away.matches.length };
  if (!amostraUtilizavel(amostras)) {
    throw new Error(
      `Sem histórico de ${home.teamName} nem de ${away.teamName}: análise não publicada (só existiria a média da liga).`,
    );
  }

  const output = runHubModel(home, away);

  /**
   * REGRA DE OURO: sem odd real, a análise existe (probabilidade é do modelo),
   * mas a tag de "Valor" não aparece em lugar nenhum — não há oportunidade a
   * criar e o resumo vai marcado com `hasOdds: false` para a UI esconder a tag.
   */
  const temOdds = Object.keys(odds).some((k) => (odds[k] ?? []).some((r) => r.odds > 1.01));
  /** `sampleHome/sampleAway` gravados no resumo alimentam `runAnalysisJob`: é
   *  assim que uma análise gerada sem amostra é reconhecida e regerada depois. */
  const resumo = { ...output.summary, hasOdds: temOdds, sampleHome: amostras.home, sampleAway: amostras.away };
  const riscos = temOdds
    ? output.riskFactors
    : [...output.riskFactors, "Sem odds no mercado para este jogo — a análise traz só probabilidade, sem valor esperado."].slice(0, 5);

  const [latest] = await db
    .select({ version: hubAnalysis.version })
    .from(hubAnalysis)
    .where(and(eq(hubAnalysis.fixtureId, fixtureId), eq(hubAnalysis.analysisType, kind)))
    .orderBy(desc(hubAnalysis.version))
    .limit(1);
  const version = (latest?.version ?? 0) + 1;

  const [inserted] = await db
    .insert(hubAnalysis)
    .values({
      fixtureId,
      version,
      analysisType: kind,
      lineupsIncluded: kind === "Final",
      summary: resumo,
      confidence: output.confidence,
      predictedHomeGoals: output.xgHome,
      predictedAwayGoals: output.xgAway,
      keyFactors: output.keyFactors,
      riskFactors: riscos,
      labInsights: output.labInsights,
      modelVersion: "v1",
    })
    .returning({ id: hubAnalysis.id });

  const analysisId = inserted.id;

  await db.insert(hubPredictionRow).values(
    output.predictions.map((p) => ({ analysisId, market: p.market, selection: p.selection, probability: p.probability })),
  );
  await db.insert(hubTopScore).values(
    output.topScores.map((s) => ({ analysisId, home: s.home, away: s.away, probability: s.probability })),
  );
  if (output.factors.length) {
    await db.insert(hubXgFactor).values(
      output.factors.map((f) => ({
        analysisId,
        side: f.side,
        factorType: f.factorType,
        impact: f.impact,
        weight: f.weight,
        context: f.context,
      })),
    );
  }

  let opportunityId: number | null = null;

  if (kind === "Final") {
    const candidate = pickOpportunity(output.predictions, odds);
    if (candidate) {
      await db.insert(hubValueBet).values({
        analysisId,
        market: candidate.market,
        selection: candidate.selection,
        probability: candidate.probability,
        odds: candidate.odds,
        value: candidate.value,
        maxPlayableOdds: candidate.maxPlayableOdds,
        isHotPick: candidate.isHotPick,
        isSubstitution: candidate.isSubstitution,
      });
      const [op] = await db
        .insert(hubOpportunity)
        .values({
          analysisId,
          fixtureId,
          market: candidate.market,
          selection: candidate.selection,
          probability: candidate.probability,
          odds: candidate.odds,
          value: candidate.value,
          stake: "1.00",
          outcome: "pending",
          isExperimental,
        })
        .returning({ id: hubOpportunity.id });
      opportunityId = op.id;
    }
  }

  return { analysisId, opportunityId };
}

/**
 * Job: gera preview para jogos das próximas 48h que ainda não têm preview, e
 * final para os que entraram na janela de 60-90 minutos com XI confirmado.
 */
export type AnalysisJobReport = { previews: number; finals: number; skipped: number; regenerated: number };

export async function runAnalysisJob(options: { refreshDegenerate?: boolean } = {}): Promise<AnalysisJobReport> {
  const refreshDegenerate = options.refreshDegenerate ?? true;
  const now = Date.now();
  const previewCutoff = new Date(now + PREVIEW_WINDOW_HOURS * 3600_000);
  const finalCutoff = new Date(now + FINAL_WINDOW_MINUTES * 60_000);

  const upcoming = await db
    .select({ id: hubFixture.id, matchDate: hubFixture.matchDate, confirmed: hubLineup.confirmed })
    .from(hubFixture)
    .leftJoin(hubLineup, eq(hubLineup.fixtureId, hubFixture.id))
    .where(and(eq(hubFixture.liveState, "NS"), lt(hubFixture.matchDate, previewCutoff)))
    .limit(200);

  const existing = upcoming.length
    ? await db
        .select({
          fixtureId: hubAnalysis.fixtureId,
          analysisType: hubAnalysis.analysisType,
          version: hubAnalysis.version,
          summary: hubAnalysis.summary,
        })
        .from(hubAnalysis)
        .where(inArray(hubAnalysis.fixtureId, upcoming.map((f) => f.id)))
        .orderBy(desc(hubAnalysis.version))
    : [];

  /**
   * A análise escolhida por jogo — a MESMA regra da tela (maior versão, Final
   * manda). Antes o job só olhava "existe Preview?": a análise degenerada
   * (gerada sem amostra) ficava eterna, porque nada a substituía. Agora ela é
   * detectada pelo `sampleHome/sampleAway` do resumo e regerada como versão
   * nova, sem sobrescrever histórico.
   */
  const escolhida = new Map<number, { analysisType: string; summary: unknown }>();
  for (const e of existing) {
    const atual = escolhida.get(e.fixtureId);
    if (!atual) {
      escolhida.set(e.fixtureId, e);
      continue;
    }
    if (atual.analysisType !== "Final" && e.analysisType === "Final") escolhida.set(e.fixtureId, e);
  }

  const degenerada = (fixtureId: number): boolean => {
    if (!refreshDegenerate) return false;
    const atual = escolhida.get(fixtureId);
    if (!atual) return false;
    return resumoDeGenerado(atual.summary as { sampleHome?: number; sampleAway?: number } | null);
  };

  let previews = 0;
  let finals = 0;
  let skipped = 0;
  let regenerated = 0;

  for (const f of upcoming) {
    try {
      const atual = escolhida.get(f.id);
      const regerar = degenerada(f.id);
      /** Final só quando o XI está confirmado e o jogo entrou na janela. */
      const cabeFinal = Boolean(f.confirmed) && f.matchDate <= finalCutoff;

      if (cabeFinal && (!atual || atual.analysisType !== "Final" || regerar)) {
        await generateAnalysis(f.id, "Final");
        finals += 1;
        if (regerar) regenerated += 1;
        continue;
      }
      if (!atual || regerar) {
        await generateAnalysis(f.id, "Preview");
        previews += 1;
        if (regerar) regenerated += 1;
      }
    } catch {
      skipped += 1;
    }
  }

  return { previews, finals, skipped, regenerated };
}

/** Análise mais recente por tipo, para a tela de detalhe. */
export async function latestAnalyses(fixtureId: number) {
  const rows = await db
    .select()
    .from(hubAnalysis)
    .where(eq(hubAnalysis.fixtureId, fixtureId))
    .orderBy(desc(hubAnalysis.createdAt));
  const preview = rows.find((r) => r.analysisType === "Preview") ?? null;
  const final = rows.find((r) => r.analysisType === "Final") ?? null;
  const review = rows.find((r) => r.analysisType === "Review") ?? null;
  return { preview, final, review };
}

/** Última oportunidade de uma fixture (para selo no centro de jogos). */
export async function opportunityForFixture(fixtureId: number) {
  const [row] = await db
    .select()
    .from(hubOpportunity)
    .where(and(eq(hubOpportunity.fixtureId, fixtureId), ne(hubOpportunity.outcome, "void")))
    .orderBy(desc(hubOpportunity.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * A fixture tem odd real no banco?
 *
 * É o que a UI consulta para decidir se mostra a tag de "Valor": sem odd > 1.01
 * em nenhum mercado, a linha existe só como probabilidade.
 */
export async function fixtureHasOdds(fixtureId: number): Promise<boolean> {
  const [row] = await db
    .select({ odds: hubBookmakerOdd.odds })
    .from(hubBookmakerOdd)
    .where(eq(hubBookmakerOdd.fixtureId, fixtureId))
    .limit(1);
  return Boolean(row && row.odds > 1.01);
}
