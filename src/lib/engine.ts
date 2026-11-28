import { getAllMatches, getSummaryRaw, getTeamHistory, normEvents, normStats, normOdds, todayYmd, ymd, type HistGame, type Match } from "./espn";
import { isMainLeagueFixture } from "./mainLeagues";
import { cached } from "./cache";
import { getKey } from "./keys";
import { smFixtureStats } from "./providers";
import { db } from "@/db";
import { picks, predictions } from "@/db/schema";
import { wilson, evOf, attachMarket } from "@/lib/credibility";
import { eq } from "drizzle-orm";
import { runModel } from "./model";
import { vereditar } from "./vereditoEngine";

/* ================= OPORTUNIDADES (estilo GreenScorer) ================= */
export type Oportunidade = { mercado: string; periodo: string; linha: string; media: number; acertos: number; totalJogos: number; oddEstimada: number | null; hist: number[]; baseParcial: boolean };

type MarketDef = { mercado: string; periodo: string; linha: string; line: number; value: (g: HistGame) => number | null };
export const MARKETS: MarketDef[] = [
  { mercado: "Gols Marcados", periodo: "Jogo todo", linha: "+0.5", line: 0.5, value: (g) => g.gf },
  { mercado: "Gols Marcados", periodo: "1º Tempo", linha: "+0.5", line: 0.5, value: (g) => g.htGf },
  { mercado: "Gols Marcados", periodo: "2º Tempo", linha: "+0.5", line: 0.5, value: (g) => (g.htGf != null ? g.gf - g.htGf : null) },
  { mercado: "Gols na Partida", periodo: "Jogo todo", linha: "+2.5", line: 2.5, value: (g) => g.gf + g.ga },
  { mercado: "Escanteios (Time)", periodo: "Jogo todo", linha: "+4.5", line: 4.5, value: (g) => g.corners },
  { mercado: "Escanteios (Jogo)", periodo: "Jogo todo", linha: "+8.5", line: 8.5, value: (g) => (g.corners != null && g.oppCorners != null ? g.corners + g.oppCorners : null) },
  { mercado: "Faltas Cometidas", periodo: "Jogo todo", linha: "+10.5", line: 10.5, value: (g) => g.fouls },
  { mercado: "Chutes no Gol", periodo: "Jogo todo", linha: "+2.5", line: 2.5, value: (g) => g.sot },
  { mercado: "Cartões (Time)", periodo: "Jogo todo", linha: "+1.5", line: 1.5, value: (g) => g.yellow },
  { mercado: "Vitórias", periodo: "Jogo todo", linha: "Vencer", line: 0.5, value: (g) => (g.res === "V" ? 1 : 0) },
  { mercado: "Ambas Marcam", periodo: "Jogo todo", linha: "Sim", line: 0.5, value: (g) => (g.gf > 0 && g.ga > 0 ? 1 : 0) },
  { mercado: "Sem Sofrer Gol", periodo: "Jogo todo", linha: "Clean Sheet", line: 0.5, value: (g) => (g.ga === 0 ? 1 : 0) },
];

export function oddFromHit(rate: number): number | null {
  const denom = rate - 0.06;
  return denom > 0 ? +(1 / denom).toFixed(2) : null;
}

export function calcularOportunidades(games: HistGame[], apenasMando?: "home" | "away"): Oportunidade[] {
  let sample = games;
  if (apenasMando === "home") sample = games.filter((g) => g.home);
  if (apenasMando === "away") sample = games.filter((g) => !g.home);
  const out: Oportunidade[] = [];
  for (const m of MARKETS) {
    const vals = sample.map(m.value).filter((v): v is number => v != null);
    if (vals.length < 3) continue;
    const acertos = vals.filter((v) => v > m.line).length;
    const rate = acertos / vals.length;
    if (rate < 0.7) continue;
    out.push({
      mercado: m.mercado, periodo: m.periodo, linha: m.linha,
      media: +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2),
      acertos, totalJogos: vals.length, oddEstimada: oddFromHit(rate),
      hist: [...vals].reverse(), baseParcial: vals.length < 5,
    });
  }
  return out.sort((a, b) => b.acertos / b.totalJogos - a.acertos / a.totalJogos || (b.oddEstimada ?? 0) - (a.oddEstimada ?? 0));
}

/* ================= DESAPITO (discrepância estatística — estilo Apitou) ================= */
export type Desapito = { mercado: string; linha: number; media: number; diff: number; direcao: "ACIMA" | "ABAIXO"; pct: number; acertos: number; total: number; hist: number[]; baseParcial: boolean };
export function calcularDesapito(games: HistGame[], getValue: (g: HistGame) => number | null, linha: number, mercado: string): Desapito | null {
  const vals = games.map(getValue).filter((v): v is number => v != null);
  if (vals.length < 3) return null;
  const media = vals.reduce((s, v) => s + v, 0) / vals.length;
  const diff = media - linha;
  const direcao = diff >= 0 ? "ACIMA" : "ABAIXO";
  const acertos = vals.filter((v) => (direcao === "ACIMA" ? v > linha : v < linha)).length;
  return { mercado, linha, media: +media.toFixed(2), diff: +diff.toFixed(2), direcao, pct: Math.round((acertos / vals.length) * 100), acertos, total: vals.length, hist: [...vals].reverse(), baseParcial: vals.length < 5 };
}
const DESAPITO_MARKETS: { mercado: string; linha: number; get: (g: HistGame) => number | null }[] = [
  { mercado: "Chutes no gol", linha: 4.5, get: (g) => g.sot },
  { mercado: "Finalizações", linha: 12.5, get: (g) => g.shots },
  { mercado: "Escanteios", linha: 4.5, get: (g) => g.corners },
  { mercado: "Gols marcados", linha: 1.5, get: (g) => g.gf },
  { mercado: "Faltas cometidas", linha: 11.5, get: (g) => g.fouls },
  { mercado: "Cartões", linha: 2.5, get: (g) => g.yellow },
];
export function desapitosDoTime(games: HistGame[], mando: "home" | "away") {
  const sample = mando === "home" ? games.filter((g) => g.home) : games.filter((g) => !g.home);
  const base = sample.length >= 3 ? sample : games;
  return DESAPITO_MARKETS.map((m) => calcularDesapito(base, m.get, m.linha, m.mercado)).filter((d): d is Desapito => !!d && Math.abs(d.diff) >= 1 && d.pct >= 60);
}

/* ================= SCOUTER ORACLE ================= */
export function calcularVeredito(xgCasa: number, xgFora: number, pressao: string, redRecente = false): { veredito: string; explicacao: string } {
  const diff = xgCasa - xgFora;
  const altaCasa = /alta.*casa/i.test(pressao), altaFora = /alta.*(visitante|fora)/i.test(pressao);
  const equilibrada = /equilibrad/i.test(pressao);
  if ((xgCasa < 0.5 && xgFora < 0.5) || redRecente)
    return { veredito: "SAIR", explicacao: redRecente ? "Cartão vermelho recente muda o cenário — risco elevado, proteja a posição." : "xG das duas equipes muito baixo (<0.5): jogo sem produção ofensiva real." };
  if (Math.abs(diff) < 0.3 && equilibrada)
    return { veredito: "COBRIR", explicacao: "Diferença de xG menor que 0.3 com pressão equilibrada — jogo truncado, considere cobertura/hedge." };
  if (diff > 0 && altaCasa)
    return { veredito: "MANTER", explicacao: "O time da casa possui xG maior e pressão ofensiva alta — o cenário sustenta a posição." };
  if (diff < 0 && altaFora)
    return { veredito: "MUDAR", explicacao: "O visitante tem xG superior e está pressionando — o fluxo virou, considere mudar a posição." };
  return { veredito: "COBRIR", explicacao: "Sinais mistos entre xG e pressão — cenário indefinido, cobertura é o caminho prudente." };
}

export async function getOracleData(match: Match) {
  const sm = await getSummaryRaw(match.league, match.id, match.state).catch(() => null);
  const stats = sm ? normStats(sm, match.home.id) : [];
  const sv = (k: string, side: "home" | "away") => { const r = stats.find((s: any) => s.key === k); const v = r ? (side === "home" ? r.home : r.away) : null; return v == null ? null : parseFloat(String(v).replace("%", "")); };
  const evs = sm ? normEvents(sm, match.home.id, match.away.id) : [];
  const redRecente = evs.slice(-4).some((e) => e.type === "red");

  let xgCasa: number | null = null, xgFora: number | null = null, selo: "real" | "estimado" | "demo" = "demo", fonte = "ESPN (estimativa por finalizações)";
  // 1) Sportmonks: xG real quando a chave existe e o fixture é encontrado
  const smKey = await getKey("sportmonks");
  if (smKey && match.live) {
    try {
      const search = await cached(`sm-search:${match.home.name}`, 3600000, async () => {
        const { smFetch } = await import("./providers");
        return smFetch(`/fixtures/search/${encodeURIComponent(match.home.name)}`);
      });
      const fx = (search?.data || []).find((f: any) => (f?.name || "").toLowerCase().includes(match.away.name.toLowerCase().split(" ")[0]));
      if (fx?.id) {
        const s = await smFixtureStats(fx.id);
        if (s.xgHome != null && s.xgAway != null) { xgCasa = Number(s.xgHome); xgFora = Number(s.xgAway); selo = "real"; fonte = "Sportmonks (xG oficial)"; }
      }
    } catch {}
  }
  // 2) ESPN ao vivo: xG estimado a partir de chutes (transparente)
  if (xgCasa == null && (sv("shotsOnTarget", "home") != null || sv("totalShots", "home") != null)) {
    const est = (side: "home" | "away") => { const sot = sv("shotsOnTarget", side) ?? 0, sh = sv("totalShots", side) ?? 0; return +(sot * 0.3 + Math.max(0, sh - sot) * 0.06).toFixed(2); };
    xgCasa = est("home"); xgFora = est("away"); selo = "estimado";
  }
  // 3) Pré-jogo: usa histórico (demo do veredito ao vivo)
  if (xgCasa == null) {
    const [hh, ah] = await Promise.all([getTeamHistory(match.league, match.home.id, 5), getTeamHistory(match.league, match.away.id, 5)]);
    const m = (g: HistGame[]) => { const v = g.map((x) => x.xgEst).filter((x): x is number => x != null); return v.length ? +(v.reduce((s, x) => s + x, 0) / v.length).toFixed(2) : 0.8; };
    xgCasa = m(hh.games); xgFora = m(ah.games); selo = "demo"; fonte = "Média pré-jogo (últimos jogos) — veredito ilustrativo até o jogo começar";
  }
  const cH = sv("wonCorners", "home") ?? 0, cA = sv("wonCorners", "away") ?? 0;
  const sotH = sv("shotsOnTarget", "home") ?? 0, sotA = sv("shotsOnTarget", "away") ?? 0;
  const pHome = sotH * 2 + cH, pAway = sotA * 2 + cA;
  const pressao = pHome === 0 && pAway === 0 ? "Equilibrada" : pHome > pAway * 1.4 ? "Alta para o Time da Casa" : pAway > pHome * 1.4 ? "Alta para o Time Visitante" : "Equilibrada";
  const { veredito, explicacao } = calcularVeredito(xgCasa!, xgFora!, pressao, redRecente);

  // Bzzoiro: probabilidades como fallback (quando configurado)
  let bzOdds: any = null;
  try { const bzKey = await getKey("bzzoiro"); if (bzKey) { const { bzFetch } = await import("./providers"); bzOdds = await bzFetch(`/v1/matches?search=${encodeURIComponent(match.home.name)}`); } } catch {}

  return { xgCasa, xgFora, pressao, veredito, explicacao, selo, fonte, live: match.live, minuto: match.clock || null, odds: sm ? normOdds(sm) : null, bzOdds: bzOdds ? "conectado" : null, updatedAt: new Date().toISOString() };
}

/* ================= MATRIZ LAST 10 (jogadores, via eventos reais) ================= */
export function playerMatrix(games: HistGame[]) {
  const map = new Map<string, { name: string; gols: number[]; assistencias: number[]; amarelos: number[]; vermelhos: number[]; participacoes: number[] }>();
  games.forEach((g, i) => {
    const mySide = g.home ? "home" : "away";
    const ensure = (name: string) => {
      if (!name) return null;
      if (!map.has(name)) map.set(name, { name, gols: Array(games.length).fill(0), assistencias: Array(games.length).fill(0), amarelos: Array(games.length).fill(0), vermelhos: Array(games.length).fill(0), participacoes: Array(games.length).fill(0) });
      return map.get(name)!;
    };
    for (const e of g.events) {
      const mine = e.type === "own" ? e.side !== mySide : e.side === mySide;
      if (!mine) continue;
      if (e.type === "goal" || e.type === "pen" || e.type === "own") { const p = ensure(e.player); if (p) { p.gols[i]++; p.participacoes[i]++; } const a = ensure(e.assist || ""); if (a && e.type !== "own") { a.assistencias[i]++; a.participacoes[i]++; } }
      if (e.type === "yellow") { const p = ensure(e.player); if (p) p.amarelos[i]++; }
      if (e.type === "red") { const p = ensure(e.player); if (p) p.vermelhos[i]++; }
    }
  });
  return [...map.values()].map((p) => ({ ...p, jogos: games.length })).sort((a, b) => sum(b.participacoes) - sum(a.participacoes));
}
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

/* ================= MONEY TIPS — Pick do Dia ================= */
export async function getPickDoDia(dateYmd: string) {
  return cached(`pick:v2:${dateYmd}`, 900000, async () => {
    const all = await getAllMatches(dateYmd);
    const candidates = all.filter((m) => m.state === "pre" && isMainLeagueFixture(m)).slice(0, 5);
    const ranked: any[] = [];
    for (const m of candidates) {
      const hist = await getTeamHistory(m.league, m.home.id, 10).catch(() => ({ games: [] as HistGame[], baseParcial: true, source: "ESPN" }));
      if (hist.games.length < 5) continue;
      const ops = calcularOportunidades(hist.games, "home");
      const focus = ops.filter((o) => ["Gols Marcados", "Escanteios (Time)", "Chutes no Gol", "Gols na Partida"].includes(o.mercado));
      const best = (focus[0] || ops[0]);
      if (!best) continue;
      const rate = best.acertos / best.totalJogos;
      const ci = wilson(best.acertos, best.totalJogos);
      const market = await attachMarket(m.league, m.id, m.state, best.mercado, best.linha);
      const ev = evOf(rate, market.odd);
      const amostraPequena = best.totalJogos < 10;
      ranked.push({
        matchId: m.id, league: m.league, status: "pendente",
        jogo: { timeCasa: m.home.name, logoCasa: m.home.logo, timeFora: m.away.name, logoFora: m.away.logo, horario: new Date(m.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }), liga: m.leagueName, data: m.date },
        oportunidade: {
          time: m.home.name, periodo: best.periodo, mercado: best.mercado, linha: best.linha, acertos: best.acertos, totalJogos: best.totalJogos,
          oddEstimada: best.oddEstimada, oddMercado: market.odd, oddFonte: market.fonte, ev,
          ci, amostraPequena, media: best.media,
          historicoGols: best.hist,
          jogosDetalhe: [...hist.games].reverse().map((g) => ({ opp: g.opp.short || g.opp.name, logo: g.opp.logo, gf: g.gf, ga: g.ga, valor: valueFor(g, best), data: g.date, id: g.id, league: g.league })),
        },
        analiseTexto: `${m.home.name} recebe ${m.away.name} pela ${m.leagueName}. Em ${best.totalJogos} jogos em casa, a linha ${best.linha} de ${best.mercado.toLowerCase()} (${best.periodo.toLowerCase()}) bateu ${best.acertos} vezes — estimativa ${Math.round(rate * 100)}%, IC 95% ${ci ? Math.round(ci.low * 100) + "–" + Math.round(ci.high * 100) + "%" : "indisponível"}. A odd justa @${best.oddEstimada ?? "—"} é só a conta 1/(taxa−6%), não uma cotação de casa.${market.odd ? ` Odd de mercado (${market.fonte}): @${market.odd}. EV ${(ev! * 100).toFixed(1)}%.` : " A ESPN não publicou odd deste mercado, então o EV não é calculado."}${amostraPequena ? " Amostra pequena: não trate este número como certeza." : ""}`,
        score: rate, baseParcial: hist.baseParcial || amostraPequena, amostra: best.totalJogos,
      });
    }
    ranked.sort((a, b) => Number(a.oportunidade.amostraPequena) - Number(b.oportunidade.amostraPequena) || b.score - a.score || (b.oportunidade.ev ?? -9) - (a.oportunidade.ev ?? -9));
    const result = { data: dateYmd, pick: ranked[0] || null, melhores: ranked.slice(0, 8), fonte: "ESPN", updatedAt: new Date().toISOString() };
    if (ranked[0]) {
      try {
        await db.insert(picks).values({ date: dateYmd, payload: ranked[0] as any }).onConflictDoUpdate({ target: picks.date, set: { payload: ranked[0] as any } });
      } catch {}
    }
    return result;
  });
}
/**
 * Valor do jogo na métrica da oportunidade. `null` quando a fonte não publicou
 * o dado daquele jogo — nunca 0 (0 inventado vira "não aconteceu" e contamina
 * a série do gráfico).
 */
function valueFor(g: HistGame, op: Oportunidade): number | null {
  const def = MARKETS.find((m) => m.mercado === op.mercado && m.periodo === op.periodo);
  return def ? def.value(g) : null;
}

/* ================= TRACK RECORD (avaliação real do modelo) ================= */
export async function settleAndReport() {
  const pend = await db.select().from(predictions).where(eq(predictions.settled, false));
  const byKey = new Map<string, typeof pend>();
  for (const p of pend) {
    if (!p.matchDate || p.matchDate.getTime() > Date.now() - 2 * 3600000) continue;
    const k = `${p.league}:${ymd(new Date(p.matchDate))}`;
    byKey.set(k, [...(byKey.get(k) || []), p]);
  }
  for (const [k, list] of byKey) {
    const [league, d] = k.split(":");
    const games = await getAllMatches(d, [league]).catch(() => []);
    for (const p of list) {
      const g = games.find((x) => x.id === p.matchId);
      if (g?.finished && g.home.score != null && g.away.score != null) {
        const actual = g.home.score > g.away.score ? "home" : g.home.score === g.away.score ? "draw" : "away";
        const o = { home: actual === "home" ? 1 : 0, draw: actual === "draw" ? 1 : 0, away: actual === "away" ? 1 : 0 };
        const brier = (p.pHome - o.home) ** 2 + (p.pDraw - o.draw) ** 2 + (p.pAway - o.away) ** 2;
        await db.update(predictions).set({ settled: true, homeScore: g.home.score, awayScore: g.away.score, brier: +brier.toFixed(4) }).where(eq(predictions.matchId, p.matchId));
        p.settled = true; p.homeScore = g.home.score; p.awayScore = g.away.score; p.brier = +brier.toFixed(4);
      }
    }
  }
  const all = await db.select().from(predictions);
  const cutoff = Date.now() - 30 * 864e5;
  const last30 = all.filter((p) => p.createdAt.getTime() >= cutoff);
  const settled = last30.filter((p) => p.settled);
  const greens = settled.filter((p) => p.fav === outcome(p)).length;
  const reds = settled.length - greens;
  const brierAvg = settled.length ? settled.reduce((s, p) => s + (p.brier ?? 0), 0) / settled.length : null;
  const byLeague: Record<string, { total: number; greens: number }> = {};
  for (const p of settled) { byLeague[p.league] = byLeague[p.league] || { total: 0, greens: 0 }; byLeague[p.league].total++; if (p.fav === outcome(p)) byLeague[p.league].greens++; }
  const pickRows = await db.select().from(picks);
  return {
    last30: { total: settled.length, greens, reds, pending: last30.length - settled.length, acc: settled.length ? Math.round((greens / settled.length) * 100) : null },
    brier: brierAvg != null ? +brierAvg.toFixed(3) : null,
    baselineBrier: 0.667,
    byLeague, totalPredictions: all.length,
    recent: all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 20).map((p) => ({ matchId: p.matchId, home: p.homeName, away: p.awayName, league: p.league, fav: p.fav, probs: [p.pHome, p.pDraw, p.pAway], settled: p.settled, score: p.settled ? `${p.homeScore}-${p.awayScore}` : null, green: p.settled ? p.fav === outcome(p) : null, model: p.modelType, date: p.createdAt })),
    picks: pickRows.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14).map((r) => ({ date: r.date, payload: r.payload, settled: r.settled, green: r.green })),
  };
}
function outcome(p: { homeScore: number | null; awayScore: number | null }) {
  if (p.homeScore == null || p.awayScore == null) return "";
  return p.homeScore > p.awayScore ? "home" : p.homeScore === p.awayScore ? "draw" : "away";
}

export async function analyzeMatch(match: Match) {
  const [hh, ah] = await Promise.all([getTeamHistory(match.league, match.home.id, 10), getTeamHistory(match.league, match.away.id, 10)]);
  const sm = await getSummaryRaw(match.league, match.id, match.state).catch(() => null);
  const { normH2H } = await import("./espn");
  const h2h = sm ? normH2H(sm) : { games: [], summary: "" };
  const analysis = runModel(match.home.name, match.away.name, hh.games, ah.games, 2.65, h2h);
  if (analysis.status === "ok" && analysis.probs) {
    const fav = analysis.probs.home >= analysis.probs.draw && analysis.probs.home >= analysis.probs.away ? "home" : analysis.probs.away >= analysis.probs.draw ? "away" : "draw";
    try {
      await db.insert(predictions).values({
        matchId: match.id, league: match.league, matchDate: new Date(match.date), homeName: match.home.name, awayName: match.away.name,
        modelType: analysis.model_type, pHome: analysis.probs.home, pDraw: analysis.probs.draw, pAway: analysis.probs.away, pOver25: analysis.probs.over25, fav,
      }).onConflictDoNothing();
    } catch {}
  }
  /* Veredito Estatístico: forma recente (70%) × H2H (30%). Calculado aqui porque
     os dois históricos já chegaram — não custa chamada extra. */
  const veredito = vereditar({
    homeGames: hh.games,
    awayGames: ah.games,
    h2hGames: (h2h.games || []).map((g: any) => ({ golsCasa: Number(g.homeScore), golsFora: Number(g.awayScore), data: g.date })),
    dataJogo: match.date ? new Date(match.date).toISOString() : undefined,
  });
  return { analysis, h2h, veredito, sampleInfo: { home: hh.games.length, away: ah.games.length, baseParcial: hh.baseParcial || ah.baseParcial } };
}

export { todayYmd };