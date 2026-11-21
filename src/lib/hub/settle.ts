import { and, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { hubAnalysis, hubFixture, hubOpportunity, hubValueBet, hubXgEvaluation } from "@/db/hub-schema";

/**
 * Liquidação do ledger.
 *
 * Regras do produto (e por que existem):
 *  - `won` -> lucro = odd - 1; `lost` -> -1; `void` -> 0. Stake sempre 1.
 *  - Jogo adiado/cancelado vira `void`: sai das estatísticas em vez de sumir.
 *  - Nada é apagado. Uma oportunidade só muda de `pending` para um estado
 *    final, uma única vez (o `where outcome = 'pending'` garante isso).
 *  - A avaliação de xG é gravada junto, porque é ela que sustenta a promessa
 *    "nosso modelo erra e mostramos onde errou".
 */

export type SettleOutcome = "won" | "lost" | "void";

export function resolveSelection(market: string, selection: string, homeScore: number, awayScore: number): SettleOutcome {
  const total = homeScore + awayScore;
  switch (market) {
    case "1X2":
      if (selection === "Home") return homeScore > awayScore ? "won" : "lost";
      if (selection === "Draw") return homeScore === awayScore ? "won" : "lost";
      if (selection === "Away") return awayScore > homeScore ? "won" : "lost";
      return "void";
    case "BTTS":
      if (selection === "Yes") return homeScore > 0 && awayScore > 0 ? "won" : "lost";
      if (selection === "No") return homeScore === 0 || awayScore === 0 ? "won" : "lost";
      return "void";
    case "Over/Under": {
      const m = selection.match(/^(Over|Under)\s+(\d+(?:\.\d+)?)$/);
      if (!m) return "void";
      const line = Number(m[2]);
      if (total === line) return "void";
      const over = total > line;
      return (m[1] === "Over") === over ? "won" : "lost";
    }
    case "DoubleChance":
      if (selection === "HomeOrDraw") return homeScore >= awayScore ? "won" : "lost";
      if (selection === "AwayOrDraw") return awayScore >= homeScore ? "won" : "lost";
      if (selection === "HomeOrAway") return homeScore !== awayScore ? "won" : "lost";
      return "void";
    default:
      return "void";
  }
}

export function profitOf(outcome: SettleOutcome, odds: number): number {
  if (outcome === "won") return Number((odds - 1).toFixed(4));
  if (outcome === "lost") return -1;
  return 0;
}

/** Arredondamento do xG para placar: para baixo, e para cima a partir de ,9. */
export function goalsFromXg(xg: number): number {
  const frac = xg - Math.floor(xg);
  return frac >= 0.9 ? Math.ceil(xg) : Math.floor(xg);
}

export type XgEvalInput = {
  homeXg: number | null;
  awayXg: number | null;
  actualHome: number;
  actualAway: number;
};

export function evaluateXg(input: XgEvalInput) {
  const modelHome = input.homeXg != null ? goalsFromXg(input.homeXg) : null;
  const modelAway = input.awayXg != null ? goalsFromXg(input.awayXg) : null;
  const exact = modelHome === input.actualHome && modelAway === input.actualAway;
  const tendency =
    modelHome != null && modelAway != null
      ? Math.sign(modelHome - modelAway) === Math.sign(input.actualHome - input.actualAway)
      : false;
  const goalDifference =
    modelHome != null && modelAway != null ? modelHome - modelAway === input.actualHome - input.actualAway : false;
  const withinOneEach =
    modelHome != null &&
    modelAway != null &&
    Math.abs(modelHome - input.actualHome) <= 1 &&
    Math.abs(modelAway - input.actualAway) <= 1;
  const grade = exact || (tendency && goalDifference) ? "hit" : withinOneEach ? "near" : "miss";
  return {
    modelHome,
    modelAway,
    exact,
    tendency,
    goalDifference,
    withinOneEach,
    grade: grade as "hit" | "near" | "miss",
  };
}

/**
 * Liquida todas as oportunidades de jogos que terminaram.
 * `limit` protege contra rodar horas de settle num request só.
 */
export async function settleFinishedFixtures(limit = 200): Promise<{ settled: number; voids: number }> {
  const pending = await db
    .select({
      opportunityId: hubOpportunity.id,
      market: hubOpportunity.market,
      selection: hubOpportunity.selection,
      odds: hubOpportunity.odds,
      fixtureId: hubFixture.id,
      homeScore: hubFixture.homeScoreFt,
      awayScore: hubFixture.awayScoreFt,
      isPostponed: hubFixture.isPostponed,
      liveState: hubFixture.liveState,
      analysisId: hubOpportunity.analysisId,
    })
    .from(hubOpportunity)
    .innerJoin(hubFixture, eq(hubFixture.id, hubOpportunity.fixtureId))
    .where(and(eq(hubOpportunity.outcome, "pending"), eq(hubFixture.liveState, "FT")))
    .limit(limit);

  let settled = 0;
  let voids = 0;

  for (const row of pending) {
    const outcome = row.isPostponed ? "void" : resolveSelection(row.market, row.selection, row.homeScore, row.awayScore);
    if (outcome === "void") voids += 1;
    const profit = profitOf(outcome, row.odds);

    const updated = await db
      .update(hubOpportunity)
      .set({ outcome, profit: profit.toFixed(4), settledAt: new Date() })
      .where(and(eq(hubOpportunity.id, row.opportunityId), eq(hubOpportunity.outcome, "pending")))
      .returning({ id: hubOpportunity.id });
    if (!updated.length) continue;
    settled += 1;

    const [analysis] = await db
      .select({ xgHome: hubAnalysis.predictedHomeGoals, xgAway: hubAnalysis.predictedAwayGoals })
      .from(hubAnalysis)
      .where(eq(hubAnalysis.id, row.analysisId))
      .limit(1);

    const evaluation = evaluateXg({
      homeXg: analysis?.xgHome ?? null,
      awayXg: analysis?.xgAway ?? null,
      actualHome: row.homeScore,
      actualAway: row.awayScore,
    });

    await db
      .insert(hubXgEvaluation)
      .values({
        opportunityId: row.opportunityId,
        homeXg: analysis?.xgHome ?? null,
        awayXg: analysis?.xgAway ?? null,
        modelHome: evaluation.modelHome,
        modelAway: evaluation.modelAway,
        actualHome: row.homeScore,
        actualAway: row.awayScore,
        exact: evaluation.exact,
        tendency: evaluation.tendency,
        goalDifference: evaluation.goalDifference,
        withinOneEach: evaluation.withinOneEach,
        grade: evaluation.grade,
      })
      .onConflictDoNothing();

    await publishReview(row.analysisId, evaluation.grade, row.homeScore, row.awayScore);
  }

  return { settled, voids };
}

/** Review pós-jogo: versão nova de análise, com o que o resultado mostrou. */
async function publishReview(analysisId: number, grade: string, homeScore: number, awayScore: number): Promise<void> {
  const [final] = await db
    .select({ fixtureId: hubAnalysis.fixtureId, version: hubAnalysis.version, summary: hubAnalysis.summary })
    .from(hubAnalysis)
    .where(eq(hubAnalysis.id, analysisId))
    .limit(1);
  if (!final) return;

  const exists = await db
    .select({ id: hubAnalysis.id })
    .from(hubAnalysis)
    .where(and(eq(hubAnalysis.fixtureId, final.fixtureId), eq(hubAnalysis.analysisType, "Review")))
    .limit(1);
  if (exists.length) return;

  const xgHome = final.summary?.xgHome ?? null;
  const xgAway = final.summary?.xgAway ?? null;

  await db.insert(hubAnalysis).values({
    fixtureId: final.fixtureId,
    version: 1,
    analysisType: "Review",
    lineupsIncluded: true,
    analysisText: `Resultado ${homeScore}:${awayScore}. Avaliação do modelo: ${grade}.`,
    summary: final.summary,
    predictedHomeGoals: xgHome,
    predictedAwayGoals: xgAway,
    keyFactors: [],
    riskFactors: [],
    labInsights: [],
    modelVersion: "v1",
  });
}

/** Estatísticas públicas a partir do ledger (bate com o que a tela promete). */
export async function performanceSummary(scope: { since?: Date } = {}) {
  const where = scope.since
    ? and(sql`${hubOpportunity.isExperimental} = false`, sql`${hubOpportunity.outcome} in ('won','lost')`, sql`${hubOpportunity.createdAt} >= ${scope.since}`)
    : and(sql`${hubOpportunity.isExperimental} = false`, sql`${hubOpportunity.outcome} in ('won','lost')`);

  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      wins: sql<number>`count(*) filter (where ${hubOpportunity.outcome} = 'won')::int`,
      losses: sql<number>`count(*) filter (where ${hubOpportunity.outcome} = 'lost')::int`,
      profit: sql<number>`coalesce(sum(${hubOpportunity.profit}), 0)::float8`,
    })
    .from(hubOpportunity)
    .where(where);

  const total = row?.total ?? 0;
  const wins = row?.wins ?? 0;
  const losses = row?.losses ?? 0;
  const profit = row?.profit ?? 0;
  return {
    total,
    wins,
    losses,
    profit: Number(profit.toFixed(2)),
    hitRate: total ? Number(((wins / total) * 100).toFixed(1)) : 0,
    roi: total ? Number(((profit / total) * 100).toFixed(1)) : 0,
  };
}

/** Fecha oportunidades de jogos que passaram da data e não têm resultado. */
export async function voidStalePending(hoursAfterKickoff = 6): Promise<number> {
  const res = await db
    .update(hubOpportunity)
    .set({ outcome: "void", profit: "0", settledAt: new Date() })
    .where(
      and(
        eq(hubOpportunity.outcome, "pending"),
        sql`${hubOpportunity.fixtureId} in (
          select id from hub_fixture
          where match_date < now() - (${hoursAfterKickoff} || ' hours')::interval
            and (live_state <> 'FT' or is_postponed = true)
        )`,
      ),
    )
    .returning({ id: hubOpportunity.id });
  return res.length;
}

/** Marca jogos cujo resultado chegou (para o job ler o que já foi liquidado). */
export async function fixturesAwaitingSettle(limit = 50) {
  return db
    .select({ id: hubFixture.id, sportmonksId: hubFixture.sportmonksId })
    .from(hubFixture)
    .where(and(eq(hubFixture.liveState, "FT"), lte(hubFixture.updatedAt, new Date())))
    .limit(limit);
}

/** Recalcula o selo de "hot pick" para o que já está publicado (admin). */
export async function refreshValueFlags(): Promise<number> {
  const res = await db
    .update(hubValueBet)
    .set({ isHotPick: sql`${hubValueBet.value} >= 0.12 and ${hubValueBet.probability} >= 0.5` })
    .returning({ analysisId: hubValueBet.analysisId });
  return res.length;
}
