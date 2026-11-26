import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { hubBookmakerOdd, hubFixture, hubLeague, hubLineup } from "@/db/hub-schema";
import { runAnalysisJob } from "./analysis";
import { settleFinishedFixtures, voidStalePending } from "./settle";
import {
  refreshLiveCascade,
  syncContextCascade,
  syncFixturesCascade,
  syncLineupsCascade,
  syncOddsCascade,
  type Attempt,
} from "./cascade";

/**
 * ORQUESTRAÇÃO do sync do Hub — usada pelo CLI (`scripts/hub-sync.ts`) e pela
 * rota `/api/hub/sync`.
 *
 * É a MESMA sequência nos dois lugares: se a ordem mudar, muda só aqui. Cada
 * etapa é idempotente, então rodar de 5 em 5 minutos ou em pedaços menores
 * (limites abaixo) não corrompe nada.
 *
 * A rota serverless precisa caber no `maxDuration`: por isso todo passo tem
 * teto de jogos (`maxOdds`, `maxLineups`, `maxContext`). O CLI usa os mesmos
 * limites, só com valores maiores.
 */

export type HubSyncOptions = {
  /** dias futuros de fixtures (0 = só hoje). */
  dates?: number;
  /**
   * dias PASSADOS de fixtures a ingerir (0 = nenhum).
   *
   * Isto é o que dá histórico ao motor: sem jogo finalizado no banco,
   * `recentMatches` devolve lista vazia para todo time e a análise de todos os
   * jogos da liga sai igual (média da liga pura). O sync antigo só olhava para
   * frente (`dates`), então a base nunca acumulava resultado.
   *
   * PADRÃO HOJE: 4 — a janela é `hoje - 4 ... hoje + 2`.
   *
   * Por que 4 e não 2 (o mínimo que cobre "ontem + anteontem"): liga europeia
   * joga no FIM DE SEMANA e copa continental no MEIO da semana. Numa quarta,
   * `hoje - 2` só alcança segunda e terça — dias sem rodada — e Premier League,
   * Libertadores, Europa League e Conference League ficam com ZERO jogo
   * finalizado no banco, mesmo com a API respondendo. Quatro dias para trás
   * pegam o sábado/domingo anterior; a `fase=historico` semanal ainda leva 7.
   * Não é filtro de liga nem falha da ESPN: essas quatro passam em
   * `isMainLeague` e têm código próprio na lista consultada.
   */
  historyDays?: number;
  /** janela de odds em horas a partir de agora. */
  odds?: number;
  /** janela de escalações em horas a partir de agora. */
  lineups?: number;
  /** janela de stats/H2H em horas a partir de agora. */
  context?: number;
  /** roda o motor de análise (preview/final). */
  analyze?: boolean;
  /** liquida o ledger (won/lost/void). */
  settle?: boolean;
  /** tetos por etapa — mantêm a execução dentro do tempo da função. */
  maxOdds?: number;
  maxLineups?: number;
  maxContext?: number;
  /**
   * Etapas ligadas/desligadas. O cron diário desliga `oddsEnabled` (a
   * Sportmonks free bloqueia) e `lineupsEnabled` para caber no tempo, e deixa
   * as duas para a rota manual `/api/hub/sync`.
   */
  oddsEnabled?: boolean;
  lineupsEnabled?: boolean;
  contextEnabled?: boolean;
  /**
   * Orçamento em ms. Uma vez estourado, as etapas seguintes são PULADAS e
   * marcadas em `report.skipped` — nunca deixamos a função morrer no teto da
   * Vercel no meio de uma escrita. 0 = sem limite.
   */
  budgetMs?: number;
};

export type SyncProviderStats = Record<string, { ok: number; fail: number; reasons: string[] }>;

const erro = (e: unknown) => String((e as Error)?.message || e);

const isoDate = (offsetDays: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

function agregar(attempts: Attempt[]): SyncProviderStats {
  const out: SyncProviderStats = {};
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

/**
 * Deslocamentos de dia a buscar: PASSADO primeiro, depois hoje e o futuro.
 *
 * Uma janela só (`-historyDays ... +dates`) em vez de dois laços separados:
 * antes o passado era uma lista à parte, com o futuro incondicional, e a janela
 * real dependia de quem chamava (a fase `fixtures` do cron pedia só 1 dia para
 * trás). Com a janela única o relatório mostra exatamente de onde até onde foi.
 */
export function janelaDeDatas(historyDays: number, dates: number): number[] {
  const out: number[] = [];
  for (let i = -Math.max(0, historyDays); i <= Math.max(0, dates); i += 1) out.push(i);
  return out;
}

/** Placar finalizado por liga dentro da janela do sync (diagnóstico do relatório). */
async function finalizadasNaJanela(historyDays: number, dates: number): Promise<Record<string, number>> {
  const de = new Date(`${isoDate(-historyDays)}T00:00:00.000Z`);
  const ate = new Date(`${isoDate(dates)}T23:59:59.999Z`);
  const rows = await db
    .select({
      slug: hubLeague.slug,
      finalizadas: sql<number>`count(*) filter (where ${hubFixture.liveState} in ('FT','AET','PEN'))::int`,
    })
    .from(hubFixture)
    .innerJoin(hubLeague, eq(hubLeague.id, hubFixture.leagueId))
    .where(and(gte(hubFixture.matchDate, de), lte(hubFixture.matchDate, ate)))
    .groupBy(hubLeague.slug);
  return Object.fromEntries(rows.map((r) => [r.slug, Number(r.finalizadas)]));
}

export async function runHubSync(opts: HubSyncOptions = {}): Promise<Record<string, unknown>> {
  const dates = opts.dates ?? 2;
  const historyDays = Math.max(0, opts.historyDays ?? 4);
  const oddsWindow = opts.odds ?? 6;
  const lineupsWindow = opts.lineups ?? 3;
  const contextWindow = opts.context ?? 24;
  const doAnalyze = opts.analyze ?? true;
  const doSettle = opts.settle ?? true;
  const maxOdds = opts.maxOdds ?? 80;
  const maxLineups = opts.maxLineups ?? 60;
  const maxContext = opts.maxContext ?? 40;
  const oddsEnabled = opts.oddsEnabled ?? true;
  const lineupsEnabled = opts.lineupsEnabled ?? true;
  const contextEnabled = opts.contextEnabled ?? true;
  const budgetMs = opts.budgetMs ?? 0;

  const t0 = Date.now();
  const skipped: string[] = [];
  /** false quando a etapa está desligada ou o orçamento de tempo acabou. */
  const podeRodar = () => budgetMs <= 0 || Date.now() - t0 < budgetMs;

  const report: Record<string, unknown> = { startedAt: new Date().toISOString() };

  /* ---------- 1) fixtures ---------- */
  const fixtures: Array<Record<string, unknown>> = [];
  const fixtureAttempts: Attempt[] = [];
  /** Jogos que o fornecedor mandou e a porta do `hub_fixture` vetou (ligas fora das 16). */
  let descartadosPorLiga = 0;

  /**
   * JANELA ÚNICA, PASSADO PRIMEIRO: `hoje - historyDays` até `hoje + dates`.
   *
   * O passado entra primeiro porque é dele que sai o insumo do motor (placar
   * finalizado por time); o futuro entra incondicionalmente, porque sem ele a
   * tela fica vazia. O passado cede para o orçamento de tempo (`podeRodar`) —
   * e é o que o relatório mostra em `skipped`.
   */
  const janela = janelaDeDatas(historyDays, dates);
  for (const offset of janela) {
    const dia = isoDate(offset);
    const passado = offset < 0;
    if (passado && !podeRodar()) {
      skipped.push("fixtures:historico");
      fixtures.push({ date: dia, skipped: true, reason: "orçamento de tempo esgotado" });
      continue;
    }
    try {
      const r = await syncFixturesCascade(dia);
      fixtureAttempts.push(...r.attempts);
      descartadosPorLiga += r.discarded;
      fixtures.push({
        date: dia,
        source: r.source,
        fixtures: r.created,
        discarded: r.discarded,
        ...(passado ? { history: true } : {}),
        attempts: r.attempts,
      });
    } catch (e) {
      fixtures.push({ date: dia, error: erro(e), ...(passado ? { history: true } : {}) });
    }
  }
  report.fixtures = {
    window: { from: isoDate(-historyDays), to: isoDate(dates), historyDays, futureDays: dates },
    byDate: fixtures,
    /**
     * Jogos FINALIZADOS por liga dentro da janela acima — é o que responde
     * "a ESPN não mandou ou o jogo está fora da janela?" sem precisar abrir o
     * banco. Liga com 0 aqui e `futuras > 0` no `hub:status` = a janela não
     * alcançou a última rodada dela (calendário), não filtro e não API.
     */
    finishedByLeague: await finalizadasNaJanela(historyDays, dates),
    discardedNonMainLeague: descartadosPorLiga,
    providers: agregar(fixtureAttempts),
  };

  /* ---------- 2) placar ao vivo ---------- */
  try {
    const live = await refreshLiveCascade();
    report.live = { touched: live.touched, providers: agregar(live.attempts) };
  } catch (e) {
    report.live = { error: erro(e) };
  }

  /* ---------- 3) odds ---------- */
  if (oddsEnabled && podeRodar()) {
    const horizon = new Date(Date.now() + Math.max(oddsWindow, 1) * 3600_000);
    const jogosOdds = await db
      .select({ id: hubFixture.id })
      .from(hubFixture)
      .where(and(eq(hubFixture.liveState, "NS"), gte(hubFixture.matchDate, new Date()), lte(hubFixture.matchDate, horizon)))
      .limit(maxOdds);

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
  } else {
    skipped.push("odds");
    report.odds = { skipped: true, reason: oddsEnabled ? "orçamento de tempo esgotado" : "desligado" };
  }

  /* ---------- 4) escalações ---------- */
  if (lineupsEnabled && podeRodar()) {
    const lineupHorizon = new Date(Date.now() + Math.max(lineupsWindow, 1) * 3600_000);
    const jogosLineup = await db
      .select({ id: hubFixture.id })
      .from(hubFixture)
      .where(and(eq(hubFixture.liveState, "NS"), gte(hubFixture.matchDate, new Date()), lte(hubFixture.matchDate, lineupHorizon)))
      .limit(maxLineups);

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
  } else {
    skipped.push("lineups");
    report.lineups = { skipped: true, reason: lineupsEnabled ? "orçamento de tempo esgotado" : "desligado" };
  }

  /* ---------- 5) stats + H2H ---------- */
  if (contextEnabled && podeRodar()) {
    const contextHorizon = new Date(Date.now() + Math.max(contextWindow, 1) * 3600_000);
    const jogosContexto = await db
      .select({ id: hubFixture.id })
      .from(hubFixture)
      .where(and(gte(hubFixture.matchDate, new Date(Date.now() - 6 * 3600_000)), lte(hubFixture.matchDate, contextHorizon)))
      .limit(maxContext);

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
  } else {
    skipped.push("context");
    report.context = { skipped: true, reason: contextEnabled ? "orçamento de tempo esgotado" : "desligado" };
  }

  /* ---------- 6) análise ---------- */
  if (doAnalyze && podeRodar()) {
    try {
      report.analysis = await runAnalysisJob();
    } catch (e) {
      report.analysis = { error: erro(e) };
    }
  } else if (doAnalyze) {
    skipped.push("analysis");
    report.analysis = { skipped: true, reason: "orçamento de tempo esgotado" };
  }

  /* ---------- 7) liquidação ---------- */
  if (doSettle && podeRodar()) {
    try {
      report.settle = await settleFinishedFixtures();
      report.voids = await voidStalePending();
    } catch (e) {
      report.settle = { error: erro(e) };
    }
  } else if (doSettle) {
    skipped.push("settle");
    report.settle = { skipped: true, reason: "orçamento de tempo esgotado" };
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
  report.skipped = skipped;
  report.durationMs = Date.now() - t0;
  report.finishedAt = new Date().toISOString();

  return report;
}
