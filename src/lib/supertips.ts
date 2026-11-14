import { fetchJson, cached } from "./cache";
import {
  getAllMatches, getStandings, getSummaryRaw, matchFromSummary, normEvents, normStats, normOdds, normH2H, normLineups, normForm,
  getTeamHistory, LEAGUES, leagueInfo, todayYmd, type Match, type HistGame,
} from "./espn";
import { db } from "@/db";
import { tipVotes, tipComments, tipLikes } from "@/db/schema";
import { eq, inArray, desc } from "drizzle-orm";

const fact = (n: number): number => (n <= 1 ? 1 : n * fact(n - 1));
const pois = (k: number, l: number) => (Math.exp(-l) * Math.pow(l, k)) / fact(k);

export function scoreDist(lh: number, la: number) {
  const MAX = 6;
  let pH = 0, pD = 0, pA = 0, over = 0, btts = 0, total = 0;
  const grid: { s: string; p: number }[] = [];
  for (let x = 0; x <= MAX; x++) for (let y = 0; y <= MAX; y++) {
    const p = pois(x, lh) * pois(y, la);
    total += p;
    if (x > y) pH += p; else if (x === y) pD += p; else pA += p;
    if (x + y >= 3) over += p;
    if (x > 0 && y > 0) btts += p;
    grid.push({ s: `${x}-${y}`, p });
  }
  const n = (v: number) => Math.round((v / (total || 1)) * 1000) / 1000;
  grid.sort((a, b) => b.p - a.p);
  return { home: n(pH), draw: n(pD), away: n(pA), over25: n(over), btts: n(btts), top: grid[0]?.s || null };
}

export type Tip = "1" | "X" | "2" | "1X" | "X2" | "12";

export function chooseTip(p: { home: number; draw: number; away: number }): Tip {
  const dc1 = p.home + p.draw, dc2 = p.away + p.draw, dc12 = p.home + p.away;
  const ranked: [Tip, number][] = [["1", p.home], ["X", p.draw], ["2", p.away], ["1X", dc1], ["X2", dc2], ["12", dc12]];
  ranked.sort((a, b) => b[1] - a[1]);
  const bestSingle = ([["1", p.home], ["X", p.draw], ["2", p.away]] as [Tip, number][]).sort((a, b) => b[1] - a[1])[0];
  if (bestSingle[1] >= 0.5) return bestSingle[0];
  if (dc1 >= 0.68 && p.home >= p.away) return "1X";
  if (dc2 >= 0.68 && p.away >= p.home) return "X2";
  if (dc12 >= 0.72 && p.draw < 0.28) return "12";
  return bestSingle[0];
}
export function tipProb(tip: Tip, p: { home: number; draw: number; away: number }) {
  if (tip === "1") return p.home;
  if (tip === "2") return p.away;
  if (tip === "X") return p.draw;
  if (tip === "1X") return p.home + p.draw;
  if (tip === "X2") return p.away + p.draw;
  return p.home + p.away;
}
export function tipHit(tip: Tip, hs: number, as: number) {
  const r = hs > as ? "1" : hs === as ? "X" : "2";
  if (tip === "1X") return r !== "2";
  if (tip === "X2") return r !== "1";
  if (tip === "12") return r !== "X";
  return tip === r;
}
function riskOf(p: number): "Alta" | "Média" | "Arriscada" {
  if (p >= 0.62) return "Alta";
  if (p >= 0.5) return "Média";
  return "Arriscada";
}
const coef = (p: number) => (p > 0.02 ? Math.round((1 / p) * 100) / 100 : null);

function footballCard(m: Match, table: Map<string, any> | undefined) {
  const h = table?.get(m.home.id), a = table?.get(m.away.id);
  let model: ReturnType<typeof scoreDist> | null = null;
  let lambdas: { home: number; away: number } | null = null;
  if (h && a && h.gp >= 3 && a.gp >= 3) {
    const rows = [...(table?.values() || [])];
    const gp = rows.reduce((s, r) => s + (r.gp || 0), 0) || 1;
    const gf = rows.reduce((s, r) => s + (r.gf || 0), 0);
    const half = Math.max(0.7, gf / gp / 2);
    const atk = (r: any) => (r.gf / r.gp) / half;
    const def = (r: any) => (r.ga / r.gp) / half;
    const lh = Math.max(0.15, Math.min(4.2, half * atk(h) * def(a) * 1.14));
    const la = Math.max(0.12, Math.min(3.8, half * atk(a) * def(h) * 0.9));
    model = scoreDist(lh, la);
    lambdas = { home: +lh.toFixed(2), away: +la.toFixed(2) };
  }
  const tip = model ? chooseTip(model) : null;
  const tp = model && tip ? tipProb(tip, model) : null;
  const hs = m.home.score, as = m.away.score;
  let track: "acertando" | "acertou" | "perdeu" | null = null;
  if (tip && hs != null && as != null && (m.live || m.finished)) {
    const ok = tipHit(tip, hs, as);
    track = m.finished ? (ok ? "acertou" : "perdeu") : ok ? "acertando" : "perdeu";
  }
  return {
    id: m.id, sport: "football" as const, league: m.league, leagueName: m.leagueName, country: m.country, flag: m.flag,
    date: m.date, state: m.state, status: m.status, clock: m.clock, live: m.live, finished: m.finished,
    home: m.home, away: m.away, ht: m.ht, venue: m.venue || "",
    probs: model ? { home: model.home, draw: model.draw, away: model.away } : null,
    tip, tipProb: tp, predScore: model?.top || null, predCoef: tp ? coef(tp) : null,
    over25: model?.over25 ?? null, btts: model?.btts ?? null,
    overLabel: model ? (model.over25 >= 0.5 ? "MAIS DE" : "MENOS DE") : null,
    bttsLabel: model ? (model.btts >= 0.5 ? "SIM" : "NÃO") : null,
    risk: tp ? riskOf(tp) : null, track, lambdas,
    source: model ? "ESPN tabela + Poisson" : "ESPN (sem amostra de gols na tabela — palpite não estimado)",
    season: h && a ? { home: { gp: h.gp, w: h.w, d: h.d, l: h.l, gf: h.gf, ga: h.ga, rank: h.rank }, away: { gp: a.gp, w: a.w, d: a.d, l: a.l, gf: a.gf, ga: a.ga, rank: a.rank } } : null,
  };
}

export async function footballCards(dateYmd: string) {
  const matches = await getAllMatches(dateYmd);
  const codes = [...new Set(matches.map((m) => m.league))];
  const tables = new Map<string, Map<string, any>>();
  await Promise.all(codes.map(async (code) => {
    const groups = await getStandings(code);
    const map = new Map<string, any>();
    for (const g of groups) for (const r of g.rows || []) map.set(String(r.teamId), r);
    tables.set(code, map);
  }));
  return matches.map((m) => footballCard(m, tables.get(m.league)));
}

function recordOf(comp: any) {
  const rec = (comp?.records || []).find((r: any) => r.type === "total" || r.name === "overall") || comp?.records?.[0];
  const [w, l] = String(rec?.summary || "").split("-").map((n: string) => parseInt(n, 10));
  return { w: w || 0, l: l || 0, summary: rec?.summary || "" };
}

export async function nbaCards(dateYmd: string) {
  try {
    const data = await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateYmd}`, {}, 45000);
    return (data?.events || []).map((ev: any) => {
      const c = ev.competitions?.[0] || {};
      const cs = c.competitors || [];
      const home = cs.find((x: any) => x.homeAway === "home") || cs[0] || {};
      const away = cs.find((x: any) => x.homeAway === "away") || cs[1] || {};
      const rh = recordOf(home), ra = recordOf(away);
      const side = (t: any, rec: { w: number; l: number }) => ({
        id: String(t?.team?.id || t?.id || ""), name: t?.team?.displayName || "—", short: t?.team?.abbreviation || "",
        logo: t?.team?.logo || "", score: t?.score != null && t.score !== "" ? Number(t.score) : null, record: rec.w + rec.l ? `${rec.w}-${rec.l}` : "",
      });
      const gh = rh.w + rh.l, ga = ra.w + ra.l;
      let probs = null as { home: number; draw: number; away: number } | null;
      if (gh >= 3 && ga >= 3) {
        const wh = (rh.w / gh) * 1.06, wa = ra.w / ga;
        const pH = wh / (wh + wa);
        probs = { home: +pH.toFixed(3), draw: 0, away: +(1 - pH).toFixed(3) };
      }
      const tip: Tip | null = probs ? (probs.home >= probs.away ? "1" : "2") : null;
      const tp = probs && tip ? (tip === "1" ? probs.home : probs.away) : null;
      const hs = side(home, rh).score, as_ = side(away, ra).score;
      const st = ev?.status?.type?.state || "pre";
      let track: "acertando" | "acertou" | "perdeu" | null = null;
      if (tip && hs != null && as_ != null && st !== "pre") {
        const ok = tipHit(tip, hs, as_);
        track = st === "post" ? (ok ? "acertou" : "perdeu") : ok ? "acertando" : "perdeu";
      }
      return {
        id: String(ev.id), sport: "nba" as const, league: "nba", leagueName: "NBA", country: "EUA", flag: "🇺🇸",
        date: ev.date, state: st, status: ev?.status?.type?.shortDetail || "", clock: ev?.status?.displayClock || "", live: st === "in", finished: st === "post",
        home: side(home, rh), away: side(away, ra), ht: null, venue: c?.venue?.fullName || "",
        probs, tip, tipProb: tp, predScore: null, predCoef: tp ? coef(tp) : null,
        over25: null, btts: null, overLabel: null, bttsLabel: null,
        risk: tp ? riskOf(tp) : null, track, lambdas: null,
        source: probs ? "ESPN aproveitamento NBA (sem média de pontos — placar previsto indisponível)" : "ESPN (amostra de vitórias insuficiente)",
        season: null,
      };
    });
  } catch { return []; }
}

export async function tennisCards(dateYmd: string) {
  const out: any[] = [];
  for (const tour of ["atp", "wta"]) {
    try {
      const data = await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/tennis/${tour}/scoreboard?dates=${dateYmd}`, {}, 60000);
      const events = data?.events || [];
      for (const ev of events) {
        const groups = ev.groupings || [];
        for (const g of groups) for (const comp of g.competitions || []) {
          const cs = comp.competitors || [];
          if (cs.length < 2) continue;
          const day = String(comp.date || ev.date || "").slice(0, 10).replace(/-/g, "");
          if (dateYmd && day && day !== dateYmd) continue;
          const mapP = (c: any) => {
            const raw = c?.score;
            const num = raw != null && raw !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : null;
            return {
              id: String(c?.athlete?.id || c?.id || ""), name: c?.athlete?.displayName || c?.athlete?.shortName || "—",
              short: c?.athlete?.shortName || "", logo: c?.athlete?.flag?.href || c?.athlete?.headshot?.href || "",
              score: num, sets: typeof raw === "string" || typeof raw === "number" ? String(raw) : "",
              rank: c?.athlete?.rank || c?.curatedRank?.current || null, winner: !!c?.winner,
            };
          };
          const a = mapP(cs[0]), b = mapP(cs[1]);
          let probs = null as { home: number; draw: number; away: number } | null;
          if (a.rank && b.rank) {
            const pA = b.rank / (a.rank + b.rank);
            probs = { home: +pA.toFixed(3), draw: 0, away: +(1 - pA).toFixed(3) };
          }
          const tip: Tip | null = probs ? (probs.home >= probs.away ? "1" : "2") : null;
          const tp = probs && tip ? (tip === "1" ? probs.home : probs.away) : null;
          const st = comp?.status?.type?.state || "pre";
          let track: "acertando" | "acertou" | "perdeu" | null = null;
          if (tip && st === "post") track = (tip === "1" ? a.winner : b.winner) ? "acertou" : "perdeu";
          out.push({
            id: String(comp.id), sport: "tennis" as const, league: tour, leagueName: ev.shortName || ev.name || tour.toUpperCase(),
            country: tour.toUpperCase(), flag: tour === "atp" ? "🎾" : "🎾",
            date: comp.date || ev.date, state: st, status: comp?.status?.type?.shortDetail || "", clock: "", live: st === "in", finished: st === "post",
            home: a, away: b, ht: null, venue: ev.name || "",
            probs, tip, tipProb: tp, predScore: null, predCoef: tp ? coef(tp) : null,
            over25: null, btts: null, overLabel: null, bttsLabel: null,
            risk: tp ? riskOf(tp) : null, track, lambdas: null,
            source: probs ? "ESPN ranking ATP/WTA (modelo por ranking, não por histórico de games)" : "ESPN (ranking ausente — palpite não estimado)",
            season: null, round: g?.grouping?.displayName || "",
          });
        }
      }
    } catch { /* torneio sem feed neste dia */ }
  }
  return out;
}

export async function cardsFor(sport: string, dateYmd: string, voterKey?: string) {
  const list = sport === "nba" ? await nbaCards(dateYmd) : sport === "tennis" ? await tennisCards(dateYmd) : await footballCards(dateYmd);
  return attachVotes(list, voterKey);
}

async function attachVotes(list: any[], voterKey?: string) {
  if (!list.length) return list;
  try {
    const ids = list.map((c) => c.id);
    const rows = await db.select().from(tipVotes).where(inArray(tipVotes.matchId, ids));
    return list.map((c) => {
      const mine = rows.filter((r) => r.matchId === c.id);
      const count = (ch: string) => mine.filter((r) => r.choice === ch).length;
      return { ...c, votes: { "1": count("1"), X: count("X"), "2": count("2"), mine: voterKey ? mine.find((r) => r.voterKey === voterKey)?.choice || null : null } };
    });
  } catch {
    return list.map((c) => ({ ...c, votes: { "1": 0, X: 0, "2": 0, mine: null } }));
  }
}

function splitStats(games: HistGame[]) {
  const pack = (arr: HistGame[]) => ({
    gp: arr.length,
    w: arr.filter((g) => g.res === "V").length,
    d: arr.filter((g) => g.res === "E").length,
    l: arr.filter((g) => g.res === "D").length,
    gf: arr.reduce((s, g) => s + g.gf, 0),
    ga: arr.reduce((s, g) => s + g.ga, 0),
    avg: arr.length ? +(arr.reduce((s, g) => s + g.gf, 0) / arr.length).toFixed(2) : 0,
  });
  return { all: pack(games), home: pack(games.filter((g) => g.home)), away: pack(games.filter((g) => !g.home)) };
}

function minuteBuckets(games: HistGame[], kinds: string[]) {
  const labels = ["0-15", "16-30", "31-45", "46-60", "61-75", "76+"];
  const counts = [0, 0, 0, 0, 0, 0];
  let used = 0;
  for (const g of games) {
    const my = g.home ? "home" : "away";
    for (const e of g.events) {
      if (!kinds.includes(e.type)) continue;
      const mine = e.type === "own" ? e.side !== my : e.side === my;
      if (!mine) continue;
      if (!e.minute && e.minute !== 0) continue;
      used++;
      const i = e.minute <= 15 ? 0 : e.minute <= 30 ? 1 : e.minute <= 45 ? 2 : e.minute <= 60 ? 3 : e.minute <= 75 ? 4 : 5;
      counts[i]++;
    }
  }
  return { labels, counts, events: used, sample: games.length };
}

function records(games: HistGame[]) {
  const first = games[0]?.res;
  let streak = 0;
  for (const g of games) { if (g.res === first) streak++; else break; }
  const win = [...games].filter((g) => g.gf > g.ga).sort((a, b) => b.gf - b.ga - (a.gf - a.ga))[0];
  const loss = [...games].filter((g) => g.ga > g.gf).sort((a, b) => b.ga - b.gf - (a.ga - a.gf))[0];
  const pens = games.reduce((s, g) => s + g.events.filter((e) => e.type === "pen" && e.side === (g.home ? "home" : "away")).length, 0);
  return {
    streak: first ? `${streak} ${first}` : "—",
    biggestWin: win ? `${win.gf}-${win.ga} vs ${win.opp.short || win.opp.name}` : "—",
    biggestLoss: loss ? `${loss.gf}-${loss.ga} vs ${loss.opp.short || loss.opp.name}` : "—",
    penalties: pens, sample: games.length,
  };
}

function cardSuggest(games: HistGame[]) {
  const vals = games.map((g) => (g.yellow != null && g.oppYellow != null ? g.yellow + g.oppYellow + (g.red || 0) : null)).filter((v): v is number => v != null);
  if (vals.length < 5) return { available: false, note: "Cartões por jogo indisponíveis nesta amostra da ESPN." };
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  const line = avg < 3.2 ? 3.5 : avg < 4.2 ? 4.5 : 5.5;
  const under = vals.filter((v) => v < line).length;
  return {
    available: true, avg: +avg.toFixed(2), line, under, total: vals.length,
    suggestion: under / vals.length >= 0.7 ? `Menos de ${line} cartões` : `Sem linha com 70%+ (${under}/${vals.length} abaixo de ${line})`,
    qualified: under / vals.length >= 0.7,
    buckets: minuteBuckets(games, ["yellow", "red"]),
  };
}

async function tryInjuries(league: string, teamId: string) {
  try {
    const data = await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/teams/${teamId}`, {}, 3600000);
    const raw = data?.team?.injuries || data?.injuries || [];
    const items = (Array.isArray(raw) ? raw : []).map((i: any) => ({
      name: i?.athlete?.displayName || i?.displayName || "—",
      status: i?.status || i?.type || "desfalque",
      detail: i?.details?.detail || i?.longComment || i?.shortComment || "",
    })).filter((i: any) => i.name !== "—");
    return { available: items.length > 0, items, note: items.length ? "ESPN" : "ESPN não publicou desfalques deste elenco." };
  } catch {
    return { available: false, items: [], note: "Fonte de desfalques indisponível agora." };
  }
}

export async function comparePayload(league: string, id: string) {
  return cached(`st-cmp:${league}:${id}`, 900000, async () => {
    const sm = await getSummaryRaw(league, id, "in");
    if (!sm?.header) throw new Error("Partida não encontrada.");
    const match = matchFromSummary(sm, league, id);
    const [hh, ah, groups, injH, injA] = await Promise.all([
      getTeamHistory(league, match.home.id, 10),
      getTeamHistory(league, match.away.id, 10),
      getStandings(league),
      tryInjuries(league, match.home.id),
      tryInjuries(league, match.away.id),
    ]);
    const table = new Map<string, any>();
    for (const g of groups) for (const r of g.rows || []) table.set(String(r.teamId), r);
    const odds = normOdds(sm);
    let implied = null as any;
    if (odds?.home && odds?.draw && odds?.away) {
      const ih = 1 / odds.home, idr = 1 / odds.draw, ia = 1 / odds.away, s = ih + idr + ia;
      implied = { home: +(ih / s).toFixed(3), draw: +(idr / s).toFixed(3), away: +(ia / s).toFixed(3), margin: +(s - 1).toFixed(3), provider: odds.provider };
    }
    const h2h = normH2H(sm);
    const h2hRates = (() => {
      const gs = h2h.games || [];
      if (!gs.length) return null;
      const over = gs.filter((g: any) => g.homeScore + g.awayScore > 2.5).length;
      const btts = gs.filter((g: any) => g.homeScore > 0 && g.awayScore > 0).length;
      return { n: gs.length, over25: Math.round((over / gs.length) * 100), btts: Math.round((btts / gs.length) * 100) };
    })();
    const playerPicks = (games: HistGame[], team: { id: string; name: string; logo: string }) => {
      const map = new Map<string, number[]>();
      games.forEach((g, i) => {
        const my = g.home ? "home" : "away";
        for (const e of g.events) {
          if (!["goal", "pen"].includes(e.type) || e.side !== my || !e.player) continue;
          if (!map.has(e.player)) map.set(e.player, Array(games.length).fill(0));
          map.get(e.player)![i]++;
        }
      });
      return [...map.entries()].map(([name, arr]) => {
        const hits = arr.filter((v) => v > 0).length;
        const rate = games.length ? hits / games.length : 0;
        return { name, team: team.name, logo: team.logo, market: "Gols", hits, total: games.length, hist: [...arr].reverse(), odd: rate > 0.06 ? +(1 / (rate - 0.06)).toFixed(2) : null };
      }).filter((p) => p.hits >= 7 && p.total >= 7).sort((a, b) => b.hits - a.hits);
    };
    return {
      match, model: footballCard(match, table),
      form: normForm(sm, match.home.id),
      events: normEvents(sm, match.home.id, match.away.id),
      stats: normStats(sm, match.home.id),
      lineups: normLineups(sm, match.home.id),
      h2h, h2hRates, odds, implied,
      home: { split: splitStats(hh.games), goalsMin: minuteBuckets(hh.games, ["goal", "pen", "own"]), cards: cardSuggest(hh.games), records: records(hh.games), injuries: injH, sample: hh.games.length, baseParcial: hh.baseParcial },
      away: { split: splitStats(ah.games), goalsMin: minuteBuckets(ah.games, ["goal", "pen", "own"]), cards: cardSuggest(ah.games), records: records(ah.games), injuries: injA, sample: ah.games.length, baseParcial: ah.baseParcial },
      playerPicks: [...playerPicks(hh.games, match.home), ...playerPicks(ah.games, match.away)],
      source: "ESPN", updatedAt: new Date().toISOString(),
    };
  });
}

function hitRate(games: HistGame[], fn: (g: HistGame) => boolean) {
  if (games.length < 7) return null;
  const hits = games.filter(fn).length;
  return { hits, total: games.length, rate: hits / games.length };
}

export async function aiPicks(dateYmd: string) {
  return cached(`st-picks:${dateYmd}`, 1200000, async () => {
    const all = await getAllMatches(dateYmd);
    const upcoming = all.filter((m) => m.state !== "post" && leagueInfo(m.league).priority <= 8).slice(0, 3);
    const blocks: any[] = [];
    for (const m of upcoming) {
      try {
        const [hh, ah, groups] = await Promise.all([getTeamHistory(m.league, m.home.id, 10), getTeamHistory(m.league, m.away.id, 10), getStandings(m.league)]);
        const table = new Map<string, any>();
        for (const g of groups) for (const r of g.rows || []) table.set(String(r.teamId), r);
        const card = footballCard(m, table);
        const markets: any[] = [];
        const push = (name: string, code: string, hr: { hits: number; total: number; rate: number } | null, modelP: number | null) => {
          if (!hr || hr.hits < 7) return;
          const odd = hr.rate > 0.06 ? +(1 / (hr.rate - 0.06)).toFixed(2) : null;
          markets.push({ name, code, hits: hr.hits, total: hr.total, trust: hr.hits, odd, modelP, qualified: true });
        };
        push("Vencedor da partida", card.probs && card.probs.home >= (card.probs.away || 0) ? "1" : "2",
          hitRate(card.probs && card.probs.home >= (card.probs.away || 0) ? hh.games : ah.games, (g) => g.res === "V"),
          card.probs ? Math.max(card.probs.home, card.probs.away) : null);
        push("Dupla chance 1X", "1X", hitRate(hh.games, (g) => g.res !== "D"), card.probs ? card.probs.home + card.probs.draw : null);
        push("Dupla chance X2", "X2", hitRate(ah.games, (g) => g.res !== "D"), card.probs ? card.probs.away + card.probs.draw : null);
        push("Ambas marcam", "BTTS", hitRate(hh.games, (g) => g.gf > 0 && g.ga > 0), card.probs ? null : null);
        const btts = hitRate(hh.games, (g) => g.gf > 0 && g.ga > 0);
        if (btts && btts.hits >= 7) markets.push({ name: "Ambas as equipes marcam", code: "GG", hits: btts.hits, total: btts.total, trust: btts.hits, odd: btts.rate > 0.06 ? +(1 / (btts.rate - 0.06)).toFixed(2) : null, modelP: card.btts, qualified: true });
        const ov = hitRate(hh.games, (g) => g.gf + g.ga > 2.5);
        const un = hitRate(hh.games, (g) => g.gf + g.ga < 2.5);
        if (ov && ov.hits >= 7) markets.push({ name: "Mais de 2.5", code: "O2.5", hits: ov.hits, total: ov.total, trust: ov.hits, odd: ov.rate > 0.06 ? +(1 / (ov.rate - 0.06)).toFixed(2) : null, modelP: card.over25, qualified: true });
        if (un && un.hits >= 7) markets.push({ name: "Menos de 2.5", code: "U2.5", hits: un.hits, total: un.total, trust: un.hits, odd: un.rate > 0.06 ? +(1 / (un.rate - 0.06)).toFixed(2) : null, modelP: card.over25 != null ? +(1 - card.over25).toFixed(3) : null, qualified: true });
        const dedup = new Map<string, any>();
        for (const mk of markets) if (!dedup.has(mk.code) || dedup.get(mk.code).hits < mk.hits) dedup.set(mk.code, mk);
        const list = [...dedup.values()].sort((a, b) => b.hits / b.total - a.hits / a.total || (b.odd || 0) - (a.odd || 0));
        blocks.push({ match: card, markets: list, best: list[0] || null, sample: { home: hh.games.length, away: ah.games.length } });
      } catch { /* jogo sem histórico */ }
    }
    return { date: dateYmd, blocks, source: "ESPN últimos jogos + Poisson da tabela", updatedAt: new Date().toISOString() };
  });
}

export async function nbaProps() {
  return cached("st-nba-props", 1800000, async () => {
    const sb = await fetchJson("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard", {}, 60000);
    const events = (sb?.events || []).slice(0, 3);
    const athletes: { id: string; name: string; team: string; photo: string; opp: string }[] = [];
    for (const ev of events) {
      try {
        const sm = await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${ev.id}`, {}, 600000);
        const leaders = sm?.leaders || [];
        for (const block of leaders) {
          for (const L of (block.leaders || []).slice(0, 1)) {
            const a = L.athlete;
            if (!a?.id || athletes.some((x) => x.id === String(a.id))) continue;
            athletes.push({ id: String(a.id), name: a.displayName, team: a.team?.abbreviation || block?.team?.abbreviation || "", photo: a.headshot?.href || "", opp: ev.shortName || ev.name || "" });
          }
        }
      } catch { /* sem leaders */ }
    }
    const props: any[] = [];
    for (const a of athletes.slice(0, 8)) {
      try {
        const gl = await fetchJson(`https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${a.id}/gamelog`, {}, 3600000);
        const names: string[] = gl?.names || [];
        const pi = names.indexOf("points"), ri = names.indexOf("totalRebounds"), ai = names.indexOf("assists");
        const cat = gl?.seasonTypes?.[0]?.categories?.[0];
        const games = (cat?.events || []).slice(0, 10);
        const num = (stats: string[], idx: number) => idx < 0 ? null : parseFloat(String(stats[idx]).split("-")[0]);
        const series = games.map((g: any) => ({ pts: num(g.stats || [], pi), reb: num(g.stats || [], ri), ast: num(g.stats || [], ai), opp: "" })).filter((g: any) => g.pts != null);
        if (series.length < 7) continue;
        const lines = [
          { key: "pts", label: "Pontos", vals: series.map((s: any) => s.pts as number) },
          { key: "reb", label: "Rebotes", vals: series.map((s: any) => s.reb).filter((v: any) => v != null) },
          { key: "ast", label: "Assistências", vals: series.map((s: any) => s.ast).filter((v: any) => v != null) },
        ];
        for (const ln of lines) {
          if (ln.vals.length < 7) continue;
          const avg = ln.vals.reduce((s: number, v: number) => s + v, 0) / ln.vals.length;
          const candidates = [0.5, 1.5, 2.5, 4.5, 6.5, 8.5, 10.5, 14.5, 19.5, 24.5, 29.5].filter((l) => l < avg);
          const best = [...candidates].reverse().map((line) => ({ line, hits: ln.vals.filter((v: number) => v > line).length })).find((x) => x.hits >= 7);
          if (!best) continue;
          const rate = best.hits / ln.vals.length;
          const grade = best.hits >= 10 ? "A+" : best.hits >= 9 ? "A" : best.hits >= 8 ? "A-" : "B+";
          props.push({
            athlete: a, market: ln.label, line: best.line, hits: best.hits, total: ln.vals.length, grade,
            avg: +avg.toFixed(1), last5: +((ln.vals.slice(0, 5).reduce((s: number, v: number) => s + v, 0) / Math.min(5, ln.vals.length))).toFixed(1),
            odd: rate > 0.06 ? +(1 / (rate - 0.06)).toFixed(2) : null,
            hist: [...ln.vals].reverse(),
            bullets: [`Bateu a linha em ${best.hits} de ${ln.vals.length}`, `Média nos últimos 5: ${(ln.vals.slice(0, 5).reduce((s: number, v: number) => s + v, 0) / Math.min(5, ln.vals.length)).toFixed(1)}`, `Média da amostra: ${avg.toFixed(1)}`],
          });
        }
      } catch { /* atleta sem gamelog */ }
    }
    props.sort((a, b) => b.hits - a.hits || b.line - a.line);
    return { props, scanned: athletes.length, source: "ESPN gamelog NBA", updatedAt: new Date().toISOString(), note: props.length ? null : "Nenhum prop com 7+ acertos nos últimos jogos disponíveis da ESPN neste momento." };
  });
}

const TREND_METRICS: { id: string; label: string; line: number; get: (g: HistGame) => number | null; opp?: boolean }[] = [
  { id: "shots", label: "finalizações", line: 12.5, get: (g) => g.shots },
  { id: "sot", label: "chutes no gol", line: 4.5, get: (g) => g.sot },
  { id: "corners", label: "escanteios", line: 4.5, get: (g) => g.corners },
  { id: "gf", label: "gols", line: 0.5, get: (g) => g.gf },
  { id: "gf_ht", label: "gols no 1º tempo", line: 0.5, get: (g) => g.htGf },
  { id: "fouls", label: "faltas", line: 10.5, get: (g) => g.fouls },
  { id: "yellow", label: "cartões", line: 1.5, get: (g) => g.yellow },
];

export async function trends(dateYmd: string) {
  return cached(`st-trends:${dateYmd}`, 1200000, async () => {
    const all = await getAllMatches(dateYmd);
    const picks = all.filter((m) => m.state !== "post" && leagueInfo(m.league).priority <= 9).slice(0, 4);
    const cards: any[] = [];
    for (const m of picks) {
      const [hh, ah] = await Promise.all([
        getTeamHistory(m.league, m.home.id, 10).catch(() => null),
        getTeamHistory(m.league, m.away.id, 10).catch(() => null),
      ]);
      if (!hh || !ah) continue;
      const sidePack = (games: HistGame[], team: Match["home"], mando: "home" | "away") => {
        const sample = games.filter((g) => (mando === "home" ? g.home : !g.home));
        const base = sample.length >= 5 ? sample : games;
        return TREND_METRICS.map((met) => {
          const vals = base.map(met.get).filter((v): v is number => v != null);
          if (vals.length < 5) return null;
          const media = vals.reduce((s, v) => s + v, 0) / vals.length;
          const diff = media - met.line;
          const dir = diff >= 0 ? "ACIMA" : "ABAIXO";
          const hits = vals.filter((v) => (dir === "ACIMA" ? v > met.line : v < met.line)).length;
          if (hits / vals.length < 0.7 || Math.abs(diff) < 0.8) return null;
          return { metric: met.id, label: met.label, line: met.line, media: +media.toFixed(1), diff: +diff.toFixed(1), dir, hits, total: vals.length, hist: [...vals].reverse(), team: team.name, teamId: team.id, logo: team.logo, mando, baseParcial: vals.length < 8 };
        }).filter(Boolean);
      };
      const homeD = sidePack(hh.games, m.home, "home") as any[];
      const awayD = sidePack(ah.games, m.away, "away") as any[];
      for (const d of [...homeD, ...awayD]) {
        const other = (d.teamId === m.home.id ? awayD : homeD).find((o) => o.metric === d.metric);
        const duplo = !!other && other.dir === d.dir;
        const segura = !!other && other.dir !== d.dir && other.dir === "ABAIXO" && d.dir === "ACIMA";
        cards.push({
          id: `${m.id}:${d.teamId}:${d.metric}`,
          match: { id: m.id, league: m.league, leagueName: m.leagueName, flag: m.flag, date: m.date, home: m.home, away: m.away },
          ...d, duplo, segura,
        });
      }
    }
    cards.sort((a, b) => b.hits / b.total - a.hits / a.total || Math.abs(b.diff) - Math.abs(a.diff));
    return { cards: cards.slice(0, 24), scanned: picks.length, source: "ESPN", updatedAt: new Date().toISOString() };
  });
}

export async function indicators(league: string, homeId: string, awayId: string) {
  const [hh, ah] = await Promise.all([getTeamHistory(league, homeId, 10), getTeamHistory(league, awayId, 10)]);
  const pack = (games: HistGame[], label: string) => {
    const n = games.length;
    const donut = (hits: number) => ({ hits, total: n, pct: n ? Math.round((hits / n) * 100) : 0 });
    return {
      label, sample: n, baseParcial: n < 5,
      cleanSheet: donut(games.filter((g) => g.ga === 0).length),
      scored: donut(games.filter((g) => g.gf > 0).length),
      unbeaten: donut(games.filter((g) => g.res !== "D").length),
      win: donut(games.filter((g) => g.res === "V").length),
    };
  };
  return {
    home: pack(hh.games.filter((g) => g.home).length >= 4 ? hh.games.filter((g) => g.home) : hh.games, "Casa"),
    away: pack(ah.games.filter((g) => !g.home).length >= 4 ? ah.games.filter((g) => !g.home) : ah.games, "Fora"),
    oddsBands: { available: false, note: "Vitória por faixa de odd exige histórico de cotações. A ESPN gratuita não publica esse histórico — indicador omitido de propósito." },
    source: "ESPN",
  };
}

export async function commentList(matchId: string) {
  const rows = await db.select().from(tipComments).where(eq(tipComments.matchId, matchId)).orderBy(desc(tipComments.createdAt)).limit(40);
  return rows.map((r) => ({ id: r.id, author: r.author, body: r.body, at: r.createdAt.toISOString() }));
}
export async function likeCount(target: string, voterKey?: string) {
  const rows = await db.select().from(tipLikes).where(eq(tipLikes.target, target));
  return { count: rows.length, mine: voterKey ? rows.some((r) => r.voterKey === voterKey) : false };
}

export { LEAGUES, todayYmd };