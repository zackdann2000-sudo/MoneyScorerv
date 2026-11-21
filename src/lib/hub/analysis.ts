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
        eq(hubFixture.liveState, "FT"),
        lt(hubFixture.matchDate, before),
        inArray(hubFixture.homeTeamId, [teamId]),
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
        eq(hubFixture.liveState, "FT"),
        lt(hubFixture.matchDate, before),
        inArray(hubFixture.awayTeamId, [teamId]),
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

async function leagueGoalAvg(leagueId: number, before: Date): Promise<{ perTeam: number; homeAvg: number }> {
  const rows = await db
    .select({ homeScore: hubFixture.homeScoreFt, awayScore: hubFixture.awayScoreFt })
    .from(hubFixture)
    .where(and(eq(hubFixture.leagueId, leagueId), lt(hubFixture.matchDate, before), eq(hubFixture.liveState, "FT")))
    .limit(400);
  if (!rows.length) return { perTeam: 1.35, homeAvg: 1.5 };
  const total = rows.reduce((s, r) => s + r.homeScore + r.awayScore, 0);
  const perTeam = total / (rows.length * 2);
  const homeAvg = rows.reduce((s, r) => s + r.homeScore, 0) / rows.length;
  return { perTeam: Math.max(0.6, perTeam), homeAvg: Math.max(0.6, homeAvg) };
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
  const output = runHubModel(home, away);

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
      summary: output.summary,
      confidence: output.confidence,
      predictedHomeGoals: output.xgHome,
      predictedAwayGoals: output.xgAway,
      keyFactors: output.keyFactors,
      riskFactors: output.riskFactors,
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
export async function runAnalysisJob(): Promise<{ previews: number; finals: number; skipped: number }> {
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
        .select({ fixtureId: hubAnalysis.fixtureId, analysisType: hubAnalysis.analysisType })
        .from(hubAnalysis)
        .where(inArray(hubAnalysis.fixtureId, upcoming.map((f) => f.id)))
    : [];
  const hasPreview = new Set(existing.filter((e) => e.analysisType === "Preview").map((e) => e.fixtureId));
  const hasFinal = new Set(existing.filter((e) => e.analysisType === "Final").map((e) => e.fixtureId));

  let previews = 0;
  let finals = 0;
  let skipped = 0;

  for (const f of upcoming) {
    try {
      if (f.confirmed && f.matchDate <= finalCutoff && !hasFinal.has(f.id)) {
        await generateAnalysis(f.id, "Final");
        finals += 1;
        continue;
      }
      if (!hasPreview.has(f.id)) {
        await generateAnalysis(f.id, "Preview");
        previews += 1;
      }
    } catch {
      skipped += 1;
    }
  }

  return { previews, finals, skipped };
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
