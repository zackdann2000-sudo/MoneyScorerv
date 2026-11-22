/**
 * Job de sincronização do módulo Hub (CLI) — SISTEMA DE CASCATA.
 *
 *   npx tsx scripts/hub-sync.ts --dates=2 --odds=6 --lineups=3 --analyze --settle
 *
 * Ordem (cada etapa idempotente, pode rodar de 5 em 5 minutos):
 *   1. fixtures      ESPN -> Football-Data.org -> Sportmonks
 *   2. placar        ESPN (jogos de hoje) + Sportmonks inplay
 *   3. odds          Sportmonks -> Bzzoiro -> ESPN   (sem odd = sem "Valor")
 *   4. escalações    Sportmonks -> Bzzoiro -> ESPN
 *   5. stats + H2H   Bzzoiro -> ESPN
 *   6. análise       preview/final (o motor roda com o que existir)
 *   7. liquidação    ledger -> won/lost/void
 *
 * O relatório final mostra POR FORNECEDOR quem respondeu e quem falhou. É a
 * primeira coisa a olhar quando um dado some.
 */
import "dotenv/config";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../src/db";
import { hubBookmakerOdd, hubFixture, hubLineup } from "../src/db/hub-schema";
import { runAnalysisJob } from "../src/lib/hub/analysis";
import { settleFinishedFixtures, voidStalePending } from "../src/lib/hub/settle";
import {
  refreshLiveCascade,
  syncContextCascade,
  syncFixturesCascade,
  syncLineupsCascade,
  syncOddsCascade,
  type Attempt,
} from "../src/lib/hub/cascade";

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

const erro = (e: unknown) => String((e as Error)?.message || e);

function agregar(attempts: Attempt[]): Record<string, { ok: number; fail: number; reasons: string[] }> {
  const out: Record<string, { ok: number; fail: number; reasons: string[] }> = {};
  for (const a of attempts) {
    const slot = (out[a.provider] ??= { ok: 0, fail: 0, reasons: [] });
    if (a.ok) slot.ok += 1;
    else {
      slot.fail += 1;
      if (a.reason && slot.reasons.length < 5 && !slot.reasons.includes(a.reason)) slot.reasons.push(a.reason);
    }
  }
  return out;
}

async function main() {
  const dates = Number(arg("dates", "1"));
  const oddsWindow = Number(arg("odds", "6"));
  const lineupsWindow = Number(arg("lineups", "3"));
  const contextWindow = Number(arg("context", "24"));
  const doAnalyze = arg("analyze") === "true" || arg("analyze") === undefined;
  const doSettle = arg("settle") === "true" || arg("settle") === undefined;

  const report: Record<string, unknown> = { startedAt: new Date().toISOString() };

  /* ---------- 1) fixtures ---------- */
  const fixtures: Array<Record<string, unknown>> = [];
  const fixtureAttempts: Attempt[] = [];
  for (let i = 0; i <= dates; i += 1) {
    const day = isoDate(i);
    try {
      const r = await syncFixturesCascade(day);
      fixtureAttempts.push(...r.attempts);
      fixtures.push({ date: day, source: r.source, fixtures: r.created, attempts: r.attempts });
    } catch (e) {
      fixtures.push({ date: day, error: erro(e) });
    }
  }
  report.fixtures = { byDate: fixtures, providers: agregar(fixtureAttempts) };

  /* ---------- 2) placar ao vivo ---------- */
  try {
    const live = await refreshLiveCascade();
    report.live = { touched: live.touched, providers: agregar(live.attempts) };
  } catch (e) {
    report.live = { error: erro(e) };
  }

  /* ---------- 3) odds ---------- */
  const horizon = new Date(Date.now() + Math.max(oddsWindow, 1) * 3600_000);
  const jogosOdds = await db
    .select({ id: hubFixture.id })
    .from(hubFixture)
    .where(and(eq(hubFixture.liveState, "NS"), gte(hubFixture.matchDate, new Date()), lte(hubFixture.matchDate, horizon)))
    .limit(80);

  const oddsAttempts: Attempt[] = [];
  const oddsPorFonte: Record<string, number> = {};
  const semOdd: number[] = [];
  let oddsWritten = 0;
  for (const f of jogosOdds) {
    try {
      const r = await syncOddsCascade(f.id);
      oddsAttempts.push(...r.attempts);
      oddsWritten += r.written;
      oddsPorFonte[r.source] = (oddsPorFonte[r.source] ?? 0) + 1;
      if (r.written === 0) semOdd.push(f.id);
    } catch (e) {
      oddsAttempts.push({ provider: "cascade", ok: false, reason: erro(e) });
    }
  }
  report.odds = {
    fixtures: jogosOdds.length,
    written: oddsWritten,
    bySource: oddsPorFonte,
    withoutOdds: semOdd.length,
    providers: agregar(oddsAttempts),
  };

  /* ---------- 4) escalações ---------- */
  const lineupHorizon = new Date(Date.now() + Math.max(lineupsWindow, 1) * 3600_000);
  const jogosLineup = await db
    .select({ id: hubFixture.id })
    .from(hubFixture)
    .where(and(eq(hubFixture.liveState, "NS"), gte(hubFixture.matchDate, new Date()), lte(hubFixture.matchDate, lineupHorizon)))
    .limit(60);

  const lineupAttempts: Attempt[] = [];
  const lineupPorFonte: Record<string, number> = {};
  let confirmadas = 0;
  let comEscalacao = 0;
  for (const f of jogosLineup) {
    try {
      const r = await syncLineupsCascade(f.id);
      lineupAttempts.push(...r.attempts);
      lineupPorFonte[r.source] = (lineupPorFonte[r.source] ?? 0) + 1;
      if (r.players > 0) comEscalacao += 1;
      if (r.confirmed) confirmadas += 1;
    } catch (e) {
      lineupAttempts.push({ provider: "cascade", ok: false, reason: erro(e) });
    }
  }
  report.lineups = {
    fixtures: jogosLineup.length,
    withLineup: comEscalacao,
    confirmed: confirmadas,
    bySource: lineupPorFonte,
    providers: agregar(lineupAttempts),
  };

  /* ---------- 5) stats + H2H ---------- */
  const contextHorizon = new Date(Date.now() + Math.max(contextWindow, 1) * 3600_000);
  const jogosContexto = await db
    .select({ id: hubFixture.id })
    .from(hubFixture)
    .where(and(gte(hubFixture.matchDate, new Date(Date.now() - 6 * 3600_000)), lte(hubFixture.matchDate, contextHorizon)))
    .limit(40);

  const contextAttempts: Attempt[] = [];
  const contextoPorFonte: Record<string, number> = {};
  for (const f of jogosContexto) {
    try {
      const r = await syncContextCascade(f.id);
      contextAttempts.push(...r.attempts);
      contextoPorFonte[r.source] = (contextoPorFonte[r.source] ?? 0) + 1;
    } catch (e) {
      contextAttempts.push({ provider: "cascade", ok: false, reason: erro(e) });
    }
  }
  report.context = { fixtures: jogosContexto.length, bySource: contextoPorFonte, providers: agregar(contextAttempts) };

  /* ---------- 6) análise ---------- */
  if (doAnalyze) {
    try {
      report.analysis = await runAnalysisJob();
    } catch (e) {
      report.analysis = { error: erro(e) };
    }
  }

  /* ---------- 7) liquidação ---------- */
  if (doSettle) {
    try {
      report.settle = await settleFinishedFixtures();
      report.voids = await voidStalePending();
    } catch (e) {
      report.settle = { error: erro(e) };
    }
  }

  /* ---------- resumo ---------- */
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(hubFixture);
  const [{ comOdd }] = await db
    .select({ comOdd: sql<number>`count(distinct ${hubBookmakerOdd.fixtureId})::int` })
    .from(hubBookmakerOdd);
  const [{ comXi }] = await db
    .select({ comXi: sql<number>`count(*)::int` })
    .from(hubLineup)
    .where(eq(hubLineup.confirmed, true));

  report.summary = {
    fixturesInDb: total,
    fixturesWithOdds: comOdd,
    fixturesWithConfirmedLineup: comXi,
    rule: "Sem odd real não há tag de Valor: o motor publica só a probabilidade.",
  };
  report.finishedAt = new Date().toISOString();

  console.log(JSON.stringify(report, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
