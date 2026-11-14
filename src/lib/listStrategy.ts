import { getStandings, getSummaryRaw, getTeamHistory, matchFromSummary, normH2H, type HistGame, type Match } from "./espn";
import { cached } from "./cache";
import { scoreDist } from "./supertips";

export type Strategy = {
  code: string;
  label: string;
  pct: number;
  confidence: number;
  fairOdd: number | null;
  result: "green" | "red" | null;
  source: string;
};

const LABELS: Record<string, string> = {
  "1": "1",
  X: "X",
  "2": "2",
  "1X": "1X",
  X2: "X2",
  "+1.5": "+1.5",
  "+2.5": "+2.5",
  "-2.5": "-2.5",
  BTTS: "Ambas",
};

export function settleStrategy(code: string, hs: number | null, as: number | null): "green" | "red" | null {
  if (hs == null || as == null) return null;
  const total = hs + as;
  const ok: Record<string, boolean> = {
    "1": hs > as,
    X: hs === as,
    "2": as > hs,
    "1X": hs >= as,
    X2: as >= hs,
    "+1.5": total > 1.5,
    "+2.5": total > 2.5,
    "-2.5": total < 2.5,
    BTTS: hs > 0 && as > 0,
  };
  if (!(code in ok)) return null;
  return ok[code] ? "green" : "red";
}

function fromTable(m: Match, table?: Map<string, any>): Strategy | null {
  const h = table?.get(m.home.id);
  const a = table?.get(m.away.id);
  if (!h || !a || h.gp < 5 || a.gp < 5) return null;
  const rows = [...(table?.values() || [])];
  const gp = rows.reduce((s, r) => s + (r.gp || 0), 0) || 1;
  const gf = rows.reduce((s, r) => s + (r.gf || 0), 0);
  const half = Math.max(0.6, gf / gp / 2);
  const atk = (r: any) => (r.gf / r.gp) / half;
  const def = (r: any) => (r.ga / r.gp) / half;
  const lh = Math.max(0.15, Math.min(4.2, half * atk(h) * def(a) * 1.14));
  const la = Math.max(0.12, Math.min(3.8, half * atk(a) * def(h) * 0.9));
  const dist = scoreDist(lh, la);
  const options = [
    { code: "1", p: dist.home, spec: 9 },
    { code: "2", p: dist.away, spec: 9 },
    { code: "X", p: dist.draw, spec: 7 },
    { code: "BTTS", p: dist.btts, spec: 8 },
    { code: "+2.5", p: dist.over25, spec: 5 },
    { code: "-2.5", p: 1 - dist.over25, spec: 6 },
    { code: "1X", p: dist.home + dist.draw, spec: 2 },
    { code: "X2", p: dist.away + dist.draw, spec: 2 },
  ].filter((o) => o.p >= 0.54 && o.p <= 0.8);
  const best = options.sort((a, b) => (b.p - 0.5) * 8 + b.spec - ((a.p - 0.5) * 8 + a.spec))[0];
  if (!best) return null;
  const pct = Math.round(best.p * 100);
  const finished = m.finished && m.home.score != null && m.away.score != null;
  return {
    code: best.code,
    label: LABELS[best.code] || best.code,
    pct,
    confidence: Math.round(best.p * 100) / 10,
    fairOdd: best.p > 0.02 ? Math.round((1 / best.p) * 100) / 100 : null,
    result: finished ? settleStrategy(best.code, m.home.score, m.away.score) : null,
    source: "ESPN tabela",
  };
}

export async function attachStrategies<T extends Match>(matches: T[]): Promise<(T & { strategy: Strategy | null })[]> {
  const codes = [...new Set(matches.map((m) => m.league))];
  const tables = new Map<string, Map<string, any>>();
  await Promise.all(codes.map(async (code) => {
    const groups = await getStandings(code);
    const map = new Map<string, any>();
    for (const g of groups) for (const r of g.rows || []) map.set(String(r.teamId), r);
    tables.set(code, map);
  }));
  return matches.map((m) => ({ ...m, strategy: fromTable(m, tables.get(m.league)) }));
}

type Cand = { code: string; label: string; hits: number; total: number; note: string; rate: number; weight: number };

function pushCand(list: Cand[], code: string, label: string, games: HistGame[], pred: (g: HistGame) => boolean, note: string, weight: number, min = 5, cut = 0.7) {
  if (games.length < min) return;
  const hits = games.filter(pred).length;
  const rate = hits / games.length;
  if (rate < cut) return;
  list.push({ code, label, hits, total: games.length, note, rate, weight });
}

export async function specificStrategy(league: string, id: string) {
  return cached(`spec-st:${league}:${id}`, 1200000, async () => {
    const sm = await getSummaryRaw(league, id, "in");
    if (!sm?.header) return { strategy: null, alternatives: [], note: "Partida não encontrada." };
    const match = matchFromSummary(sm, league, id);
    const [hh, ah] = await Promise.all([
      getTeamHistory(league, match.home.id, 10).catch(() => ({ games: [] as HistGame[] })),
      getTeamHistory(league, match.away.id, 10).catch(() => ({ games: [] as HistGame[] })),
    ]);
    const homeG = hh.games.filter((g) => g.home);
    const awayG = ah.games.filter((g) => !g.home);
    const homeBase = homeG.length >= 5 ? homeG : hh.games;
    const awayBase = awayG.length >= 5 ? awayG : ah.games;
    const list: Cand[] = [];
    const homeNote = homeG.length >= 5 ? "jogos do mandante em casa" : "últimos jogos do mandante";
    const awayNote = awayG.length >= 5 ? "jogos do visitante fora" : "últimos jogos do visitante";
    pushCand(list, "1", "Vitória do mandante", homeBase, (g) => g.res === "V", homeNote, 9);
    pushCand(list, "2", "Vitória do visitante", awayBase, (g) => g.res === "V", awayNote, 9);
    pushCand(list, "HOME_SCORE", "Mandante marca", homeBase, (g) => g.gf > 0, homeNote, 4);
    pushCand(list, "AWAY_SCORE", "Visitante marca", awayBase, (g) => g.gf > 0, awayNote, 4);
    pushCand(list, "BTTS", "Ambas marcam", homeBase, (g) => g.gf > 0 && g.ga > 0, homeNote, 7);
    pushCand(list, "+2.5", "Mais de 2.5", homeBase, (g) => g.gf + g.ga > 2.5, homeNote, 6);
    pushCand(list, "-2.5", "Menos de 2.5", homeBase, (g) => g.gf + g.ga < 2.5, homeNote, 6);
    pushCand(list, "CS_HOME", "Mandante não sofre", homeBase, (g) => g.ga === 0, homeNote, 8);
    pushCand(list, "CORNERS", "Escanteios do mandante +4.5", homeBase, (g) => (g.corners ?? -1) > 4.5, homeNote, 8);
    pushCand(list, "FOULS", "Faltas do mandante +10.5", homeBase, (g) => (g.fouls ?? -1) > 10.5, homeNote, 5);
    pushCand(list, "CARDS", "Cartões do mandante +1.5", homeBase, (g) => (g.yellow ?? -1) > 1.5, homeNote, 7);
    const h2h = normH2H(sm).games || [];
    if (h2h.length >= 3) {
      const n = h2h.length;
      const over = h2h.filter((g: any) => g.homeScore + g.awayScore > 2.5).length;
      const btts = h2h.filter((g: any) => g.homeScore > 0 && g.awayScore > 0).length;
      const homeWins = h2h.filter((g: any) => (g.homeId === match.home.id ? g.homeScore > g.awayScore : g.awayScore > g.homeScore)).length;
      if (over / n >= 0.67) list.push({ code: "+2.5", label: "Mais de 2.5 no H2H", hits: over, total: n, note: "confrontos diretos", rate: over / n, weight: 12 });
      if (btts / n >= 0.67) list.push({ code: "BTTS", label: "Ambas no H2H", hits: btts, total: n, note: "confrontos diretos", rate: btts / n, weight: 12 });
      if (homeWins / n >= 0.67) list.push({ code: "1", label: "Mandante vence o H2H", hits: homeWins, total: n, note: "confrontos diretos", rate: homeWins / n, weight: 12 });
    }
    const generic = new Set(["HOME_SCORE", "AWAY_SCORE"]);
    const ranked = list
      .filter((c) => !generic.has(c.code) || !list.some((o) => !generic.has(o.code) && o.rate >= 0.7))
      .sort((a, b) => b.weight + b.rate * 10 - (a.weight + a.rate * 10) || b.rate - a.rate);
    const best = ranked[0];
    if (!best) {
      return { strategy: null, alternatives: [], note: "Nenhuma linha bateu 70% nos últimos jogos destes times ou no confronto direto.", source: "ESPN", updatedAt: new Date().toISOString() };
    }
    const finished = match.finished && match.home.score != null && match.away.score != null;
    const strategy = {
      code: best.code,
      label: best.label,
      pct: Math.round(best.rate * 100),
      confidence: Math.round(best.rate * 100) / 10,
      fairOdd: best.rate > 0.06 ? Math.round((1 / (best.rate - 0.06)) * 100) / 100 : null,
      result: finished ? settleStrategy(best.code === "HOME_SCORE" ? "HOME_SCORE" : best.code, match.home.score, match.away.score) : null,
      source: `ESPN · ${best.hits}/${best.total} ${best.note}`,
      sample: `${best.hits}/${best.total}`,
    };
    if (best.code === "HOME_SCORE" && finished) strategy.result = (match.home.score ?? 0) > 0 ? "green" : "red";
    if (best.code === "AWAY_SCORE" && finished) strategy.result = (match.away.score ?? 0) > 0 ? "green" : "red";
    if (best.code === "CS_HOME" && finished) strategy.result = (match.away.score ?? 1) === 0 ? "green" : "red";
    return {
      strategy,
      alternatives: ranked.slice(1, 4).map((c) => ({ label: c.label, sample: `${c.hits}/${c.total}`, note: c.note })),
      note: null,
      source: "ESPN",
      updatedAt: new Date().toISOString(),
    };
  });
}