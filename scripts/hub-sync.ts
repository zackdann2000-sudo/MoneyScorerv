/**
 * Job de sincronização do módulo Hub (CLI).
 *
 *   npx tsx scripts/hub-sync.ts --dates=2 --odds=1 --analyze --settle
 *
 * Ordem: fixtures -> odds dos jogos próximos -> lineups dos jogos na janela de
 * ~2h -> análise (preview/final) -> liquidação do ledger. Cada etapa é
 * idempotente, então rodar de 5 em 5 minutos é seguro e é o desenho esperado
 * do cron (ver /api/hub/cron).
 */
import "dotenv/config";
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "../src/db";
import { hubFixture } from "../src/db/hub-schema";
import { runAnalysisJob } from "../src/lib/hub/analysis";
import { settleFinishedFixtures, voidStalePending } from "../src/lib/hub/settle";
import { syncFixturesForDate, syncLineups, syncLiveScores, syncOdds } from "../src/lib/hub/sportmonks";

function arg(name: string, fallback?: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.split("=")[1];
  if (process.argv.includes(`--${name}`)) return "true";
  return fallback;
}

const isoDate = (offsetDays: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

async function main() {
  const dates = Number(arg("dates", "1"));
  const oddsWindow = Number(arg("odds", "0"));
  const doAnalyze = arg("analyze") === "true" || arg("analyze") === undefined;
  const doSettle = arg("settle") === "true" || arg("settle") === undefined;

  const report: Record<string, unknown> = {};

  // 1) fixtures do dia (e dos próximos N dias)
  const syncSummary = [] as unknown[];
  for (let i = 0; i <= dates; i += 1) {
    const day = isoDate(i);
    try {
      syncSummary.push(await syncFixturesForDate(day));
    } catch (e) {
      syncSummary.push({ date: day, error: String((e as Error).message || e) });
    }
  }
  report.fixtures = syncSummary;

  // 2) placar ao vivo
  try {
    report.live = await syncLiveScores(isoDate(0));
  } catch (e) {
    report.live = { error: String((e as Error).message || e) };
  }

  // 3) odds dos jogos que começam nas próximas `oddsWindow` horas (ou todos se 0)
  const horizon = new Date(Date.now() + Math.max(oddsWindow, 1) * 3600_000);
  const near = await db
    .select({ id: hubFixture.id, sportmonksId: hubFixture.sportmonksId })
    .from(hubFixture)
    .where(and(eq(hubFixture.liveState, "NS"), gte(hubFixture.matchDate, new Date()), lte(hubFixture.matchDate, horizon)))
    .limit(80);

  const oddsReport: unknown[] = [];
  for (const f of near) {
    try {
      oddsReport.push(await syncOdds(f.sportmonksId));
    } catch (e) {
      oddsReport.push({ fixture: f.sportmonksId, error: String((e as Error).message || e) });
    }
  }
  report.odds = { fixtures: near.length, results: oddsReport.length };

  // 4) lineups dos jogos nas próximas 3h
  const lineupHorizon = new Date(Date.now() + 3 * 3600_000);
  const close = await db
    .select({ sportmonksId: hubFixture.sportmonksId })
    .from(hubFixture)
    .where(and(eq(hubFixture.liveState, "NS"), gte(hubFixture.matchDate, new Date()), lte(hubFixture.matchDate, lineupHorizon)))
    .limit(60);

  let confirmed = 0;
  for (const f of close) {
    try {
      const res = await syncLineups(f.sportmonksId);
      if (res.confirmed) confirmed += 1;
    } catch {
      // lineup ainda não publicado: normal antes de ~1h do jogo
    }
  }
  report.lineups = { checked: close.length, confirmed };

  // 5) análise
  if (doAnalyze) {
    try {
      report.analysis = await runAnalysisJob();
    } catch (e) {
      report.analysis = { error: String((e as Error).message || e) };
    }
  }

  // 6) liquidação
  if (doSettle) {
    try {
      report.settle = await settleFinishedFixtures();
      report.voids = await voidStalePending();
    } catch (e) {
      report.settle = { error: String((e as Error).message || e) };
    }
  }

  console.log(JSON.stringify(report, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
