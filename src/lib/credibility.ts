import { getAllMatches, getSummaryRaw, normStats, normOdds, todayYmd, type Match } from "./espn";
import { db } from "@/db";
import { pickLedger, picks } from "@/db/schema";
import { eq } from "drizzle-orm";

/** Intervalo de Wilson 95% para uma proporção. Não é odd e não é garantia. */
export function wilson(hits: number, n: number, z = 1.96) {
  if (n <= 0) return null;
  const p = hits / n;
  const z2 = z * z;
  const den = 1 + z2 / n;
  const centre = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  return {
    low: Math.max(0, Math.round(((centre - margin) / den) * 1000) / 1000),
    high: Math.min(1, Math.round(((centre + margin) / den) * 1000) / 1000),
  };
}

export function lineNumber(linha: string) {
  const n = parseFloat(String(linha).replace("+", "").replace(",", "."));
  return Number.isFinite(n) ? n : 0.5;
}

/** Odd de mercado só quando a ESPN publica a cotação daquele mercado. */
export function marketOddFor(mercado: string, linha: string, odds: { home?: number | null; draw?: number | null; away?: number | null; ou?: number | null; over?: number | null; under?: number | null } | null, side: "home" | "away" = "home") {
  if (!odds) return null;
  const line = lineNumber(linha);
  if (mercado === "Gols na Partida" && odds.ou != null && Math.abs(odds.ou - line) < 0.01) {
    return odds.over ?? null;
  }
  if (mercado === "Vitórias") return side === "home" ? odds.home ?? null : odds.away ?? null;
  return null;
}

export function evOf(rate: number, marketOdd: number | null) {
  if (marketOdd == null || marketOdd <= 1) return null;
  return Math.round((rate * marketOdd - 1) * 1000) / 1000;
}

export async function attachMarket(league: string, matchId: string, state: string, mercado: string, linha: string) {
  try {
    const sm = await getSummaryRaw(league, matchId, state);
    const odds = normOdds(sm);
    const odd = marketOddFor(mercado, linha, odds);
    return { odd, fonte: odds?.provider || null, ou: odds?.ou ?? null };
  } catch {
    return { odd: null, fonte: null, ou: null };
  }
}

async function marketValue(match: Match, mercado: string, periodo: string): Promise<number | null> {
  const hs = match.home.score, as = match.away.score;
  if (mercado === "Gols Marcados" && periodo === "Jogo todo") return hs;
  if (mercado === "Gols Marcados" && periodo === "1º Tempo") return match.ht?.home ?? null;
  if (mercado === "Gols Marcados" && periodo === "2º Tempo") return hs != null && match.ht?.home != null ? hs - match.ht.home : null;
  if (mercado === "Gols na Partida") return hs != null && as != null ? hs + as : null;
  if (mercado === "Vitórias") return hs != null && as != null ? (hs > as ? 1 : 0) : null;
  if (mercado === "Ambas Marcam") return hs != null && as != null ? (hs > 0 && as > 0 ? 1 : 0) : null;
  if (mercado === "Sem Sofrer Gol") return as != null ? (as === 0 ? 1 : 0) : null;
  if (!match.finished) return null;
  try {
    const sm = await getSummaryRaw(match.league, match.id, "post");
    const stats = normStats(sm, match.home.id);
    const sv = (k: string, side: "home" | "away") => {
      const row = stats.find((s) => s.key === k);
      const v = row ? (side === "home" ? row.home : row.away) : null;
      return v == null ? null : parseFloat(String(v).replace("%", ""));
    };
    if (mercado.startsWith("Escanteios (Time)")) return sv("wonCorners", "home");
    if (mercado.startsWith("Escanteios (Jogo)")) {
      const h = sv("wonCorners", "home"), a = sv("wonCorners", "away");
      return h != null && a != null ? h + a : null;
    }
    if (mercado === "Chutes no Gol") return sv("shotsOnTarget", "home");
    if (mercado === "Faltas Cometidas") return sv("foulsCommitted", "home");
    if (mercado === "Cartões (Time)") return sv("yellowCards", "home");
  } catch { /* estatística não publicada */ }
  return null;
}

export async function settleLedger() {
  let rows: typeof pickLedger.$inferSelect[] = [];
  try {
    rows = await db.select().from(pickLedger);
  } catch { return { updated: 0 }; }
  const open = rows.filter((r) => r.status === "pendente" || r.status === "ao_vivo");
  const byKey = new Map<string, Match[]>();
  let updated = 0;
  for (const row of open.slice(0, 40)) {
    const pay: any = row.payload || {};
    const key = `${row.league}:${row.date}`;
    if (!byKey.has(key)) byKey.set(key, await getAllMatches(row.date, row.league ? [row.league] : undefined).catch(() => []));
    const match = byKey.get(key)?.find((m) => m.id === row.matchId);
    if (!match) continue;
    let status = row.status;
    let profit: number | null = row.profit;
    let settledAt: Date | null = row.settledAt;
    if (match.live) status = "ao_vivo";
    else if (match.finished) {
      const value = await marketValue(match, pay?.oportunidade?.mercado || "", pay?.oportunidade?.periodo || "Jogo todo");
      const linha = pay?.oportunidade?.linha || "+0.5";
      if (value == null) {
        status = "anulada";
        profit = null;
      } else {
        const green = value > lineNumber(linha);
        status = green ? "green" : "red";
        profit = row.oddMercado != null ? (green ? Math.round((row.oddMercado - 1) * 1000) / 1000 : -1) : null;
      }
      settledAt = new Date();
    } else status = "pendente";
    if (status !== row.status || profit !== row.profit) {
      await db.update(pickLedger).set({ status, profit, settledAt }).where(eq(pickLedger.id, row.id));
      updated++;
      if (row.isPick && (status === "green" || status === "red" || status === "anulada")) {
        try {
          await db.update(picks).set({ settled: status !== "anulada", green: status === "green" }).where(eq(picks.date, row.date));
        } catch { /* tabela picks segue como espelho, não como fonte */ }
      }
    }
  }
  return { updated };
}

export async function recordPublished(items: any[], date: string) {
  for (const [i, item] of items.entries()) {
    const op = item?.oportunidade;
    if (!item?.matchId || !op) continue;
    const marketKey = `${op.mercado}|${op.periodo}|${op.linha}|home`;
    try {
      await db.insert(pickLedger).values({
        matchId: item.matchId,
        date,
        league: item.league || "",
        marketKey,
        payload: item,
        status: "pendente",
        oddMercado: op.oddMercado ?? null,
        oddJusta: op.oddEstimada ?? null,
        ev: op.ev ?? null,
        isPick: i === 0,
      }).onConflictDoNothing();
    } catch { /* ledger ainda não migrado */ }
  }
}

export async function auditPicks(opts: { period?: string; league?: string; market?: string }) {
  await settleLedger();
  let rows: typeof pickLedger.$inferSelect[] = [];
  try { rows = await db.select().from(pickLedger); } catch { rows = []; }
  const now = new Date();
  const days = opts.period === "7" ? 7 : opts.period === "90" ? 90 : opts.period === "all" ? 3650 : 30;
  const cutoff = new Date(now.getTime() - days * 864e5).toISOString().slice(0, 10).replace(/-/g, "");
  let list = rows.filter((r) => opts.period === "all" || r.date >= cutoff);
  if (opts.league && opts.league !== "all") list = list.filter((r) => r.league === opts.league);
  if (opts.market && opts.market !== "all") list = list.filter((r) => String((r.payload as any)?.oportunidade?.mercado || "").toLowerCase().includes(opts.market!.toLowerCase()));
  list.sort((a, b) => b.date.localeCompare(a.date) || Number(b.isPick) - Number(a.isPick));

  const decided = list.filter((r) => r.status === "green" || r.status === "red");
  const greens = decided.filter((r) => r.status === "green").length;
  const withPrice = decided.filter((r) => r.profit != null);
  const profit = Math.round(withPrice.reduce((s, r) => s + (r.profit || 0), 0) * 1000) / 1000;
  const roi = withPrice.length ? Math.round((profit / withPrice.length) * 1000) / 1000 : null;
  let streak = 0;
  let streakKind = "";
  for (const r of decided) {
    if (!streakKind) streakKind = r.status;
    if (r.status === streakKind) streak++;
    else break;
  }
  const chrono = [...withPrice].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  let run = 0;
  const curve = chrono.map((r) => { run = Math.round((run + (r.profit || 0)) * 1000) / 1000; return { date: `${r.date.slice(6, 8)}/${r.date.slice(4, 6)}`, lucro: run, match: (r.payload as any)?.jogo?.timeCasa || r.matchId }; });
  const leagues = [...new Set(rows.map((r) => r.league).filter(Boolean))];
  const markets = [...new Set(rows.map((r) => (r.payload as any)?.oportunidade?.mercado).filter(Boolean))];
  return {
    period: opts.period || "30",
    summary: {
      total: list.length,
      greens,
      reds: decided.length - greens,
      pending: list.filter((r) => r.status === "pendente").length,
      live: list.filter((r) => r.status === "ao_vivo").length,
      voided: list.filter((r) => r.status === "anulada").length,
      acc: decided.length ? Math.round((greens / decided.length) * 1000) / 10 : null,
      roi,
      yield: roi,
      profit,
      priced: withPrice.length,
      streak,
      streakKind,
      note: withPrice.length < decided.length ? "ROI e yield usam stake de 1 unidade só nas picks com odd de mercado publicada. As demais entram na taxa de acerto, mas não no lucro." : "Stake de 1 unidade. ROI = lucro / picks com odd de mercado.",
    },
    curve,
    leagues,
    markets,
    rows: list.slice(0, 200).map((r) => ({
      id: r.id,
      date: r.date,
      league: r.league,
      matchId: r.matchId,
      status: r.status,
      isPick: r.isPick,
      oddMercado: r.oddMercado,
      oddJusta: r.oddJusta,
      ev: r.ev,
      profit: r.profit,
      jogo: (r.payload as any)?.jogo || null,
      oportunidade: (r.payload as any)?.oportunidade || null,
    })),
    updatedAt: new Date().toISOString(),
    today: todayYmd(),
  };
}