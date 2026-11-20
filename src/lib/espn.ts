import { fetchJson } from "./cache";

export const LEAGUES = [
  { code: "bra.1", name: "Brasileirão Série A", country: "Brasil", flag: "🇧🇷", priority: 1 },
  { code: "conmebol.libertadores", name: "Libertadores", country: "América do Sul", flag: "🌎", priority: 2 },
  { code: "uefa.champions", name: "Champions League", country: "Europa", flag: "🏆", priority: 3 },
  { code: "uefa.nations", name: "UEFA Nations League", country: "Europa", flag: "🇪🇺", priority: 3.5 },
  { code: "eng.1", name: "Premier League", country: "Inglaterra", flag: "🏴", priority: 4 },
  { code: "esp.1", name: "LaLiga", country: "Espanha", flag: "🇪🇸", priority: 5 },
  { code: "ita.1", name: "Serie A", country: "Itália", flag: "🇮🇹", priority: 6 },
  { code: "ger.1", name: "Bundesliga", country: "Alemanha", flag: "🇩🇪", priority: 7 },
  { code: "fra.1", name: "Ligue 1", country: "França", flag: "🇫🇷", priority: 8 },
  { code: "uefa.europa", name: "Europa League", country: "Europa", flag: "🇪🇺", priority: 9 },
  { code: "conmebol.sudamericana", name: "Sudamericana", country: "América do Sul", flag: "🌎", priority: 10 },
  { code: "por.1", name: "Liga Portugal", country: "Portugal", flag: "🇵", priority: 11 },
  { code: "ned.1", name: "Eredivisie", country: "Holanda", flag: "🇳🇱", priority: 12 },
  { code: "arg.1", name: "Liga Profissional", country: "Argentina", flag: "🇦🇷", priority: 13 },
  { code: "bra.2", name: "Brasileirão Série B", country: "Brasil", flag: "🇧", priority: 14 },
  { code: "mex.1", name: "Liga MX", country: "México", flag: "🇲🇽", priority: 15 },
  { code: "usa.1", name: "MLS", country: "EUA", flag: "US", priority: 16 },
  { code: "uefa.europa.conf", name: "Conference League", country: "Europa", flag: "EU", priority: 17 },
  { code: "ger.2", name: "2. Bundesliga", country: "Alemanha", flag: "DE", priority: 18 },
  { code: "bel.1", name: "Liga Jupiler", country: "Bélgica", flag: "BE", priority: 19 },
  { code: "ksa.1", name: "Divisão 1", country: "Arábia Saudita", flag: "SA", priority: 20 },
  { code: "chi.1", name: "Liga de Primera", country: "Chile", flag: "CL", priority: 21 },
  { code: "col.1", name: "Primeira A", country: "Colômbia", flag: "CO", priority: 22 },
  { code: "bol.1", name: "Divisão Profissional", country: "Bolívia", flag: "BO", priority: 23 },
];
export const leagueInfo = (code: string) => LEAGUES.find((l) => l.code === code) || { code, name: code, country: "", flag: "⚽", priority: 99 };

export const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
export const todayYmd = () => ymd(new Date());

const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";

/* ESPN tem dois hosts com o mesmo formato. O `site.api` costuma devolver 403
   (Akamai) para IPs que fazem muitas chamadas seguidas — o `site.web` segue
   respondendo. Guardamos o último host que funcionou. */
const HOSTS = ["site.api.espn.com", "site.web.api.espn.com"];
let hostOk = 0;

export async function espnGet(path: string, ttlMs: number, cacheKey?: string): Promise<any> {
  const ordem = [hostOk, ...[0, 1].filter((i) => i !== hostOk)];
  let ultimo: unknown = null;
  for (const i of ordem) {
    try {
      const data = await fetchJson(
        `https://${HOSTS[i]}/apis/site/v2/sports/soccer${path}`,
        {},
        ttlMs,
        cacheKey ? `${cacheKey}@h${i}` : undefined,
      );
      hostOk = i;
      return data;
    } catch (e) {
      ultimo = e;
    }
  }
  throw ultimo instanceof Error ? ultimo : new Error("ESPN indisponível");
}

export type Side = { id: string; name: string; short: string; logo: string; score: number | null; winner?: boolean; form?: string; color?: string };
export type Match = {
  id: string; league: string; leagueName: string; country: string; flag: string;
  date: string; state: "pre" | "in" | "post"; status: string; clock: string; period: number; live: boolean; finished: boolean;
  home: Side; away: Side; venue?: string; odds?: { details?: string; ou?: number } | null;
  prices?: { home: number | null; draw: number | null; away: number | null } | null;
  ht: { home: number | null; away: number | null } | null;
};

function normSide(c: any): Side {
  const rawScore = c?.score?.value ?? c?.score;
  return {
    id: String(c?.team?.id || ""), name: c?.team?.displayName || c?.team?.name || "—",
    short: c?.team?.shortDisplayName || c?.team?.abbreviation || "", logo: c?.team?.logo || (c?.team?.logos?.[0]?.href ?? ""),
    score: rawScore != null && rawScore !== "" ? Number(rawScore) : null, winner: !!c?.winner, form: c?.form || "", color: c?.team?.color || "",
  };
}
export function normEvent(ev: any, league: string): Match {
  const comp = ev?.competitions?.[0] || {};
  const cs = comp.competitors || [];
  const li = leagueInfo(league);
  const status = ev?.status || comp?.status || {};
  const st = status?.type?.state || "pre";
  return {
    id: String(ev.id), league, leagueName: li.name, country: li.country, flag: li.flag,
    date: ev.date, state: st, status: status?.type?.shortDetail || status?.type?.detail || "",
    clock: status?.displayClock || "", period: status?.period || 0, live: st === "in", finished: st === "post",
    home: normSide(cs.find((c: any) => c.homeAway === "home") || cs[0]),
    away: normSide(cs.find((c: any) => c.homeAway === "away") || cs[1]),
    venue: comp?.venue?.fullName || "",
    odds: comp?.odds?.[0] ? { details: comp.odds[0].details, ou: comp.odds[0].overUnder } : null,
    prices: (() => {
      const o = comp?.odds?.[0];
      if (!o) return null;
      const dec = (ml: any) => { const n = Number(ml); if (!n) return null; return n > 0 ? +(1 + n / 100).toFixed(2) : +(1 + 100 / Math.abs(n)).toFixed(2); };
      const home = dec(o.homeTeamOdds?.moneyLine ?? o.homeTeamOdds?.odds?.value);
      const draw = dec(o.drawOdds?.moneyLine ?? o.drawOdds?.value);
      const away = dec(o.awayTeamOdds?.moneyLine ?? o.awayTeamOdds?.odds?.value);
      return home || draw || away ? { home, draw, away } : null;
    })(),
    ht: (() => {
      const hv = cs.find((c: any) => c.homeAway === "home") || cs[0];
      const av = cs.find((c: any) => c.homeAway === "away") || cs[1];
      const ls = (c: any) => { const v = c?.linescores?.[0]?.value ?? c?.linescores?.[0]?.displayValue; return v != null && v !== "" ? Number(v) : null; };
      const h = ls(hv), a = ls(av);
      return h == null && a == null ? null : { home: h, away: a };
    })(),
  };
}

export async function getScoreboard(league: string, dateYmd: string): Promise<Match[]> {
  /* ESPN só aceita AAAAMMDD. Aceitamos "2026-11-19" e normalizamos aqui — sem
     isso o endpoint devolve 400 e a lista vem vazia. */
  const dia = String(dateYmd || "").replace(/\D/g, "").slice(0, 8);
  const key = `sb:${league}:${dia}`;
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const data = await espnGet(`/${league}/scoreboard?dates=${dia}`, 45000, tentativa === 0 ? key : `${key}:r`);
      return (data?.events || []).map((e: any) => normEvent(e, league));
    } catch {
      if (tentativa === 1) return [];
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  return [];
}

export async function getAllMatches(dateYmd: string, codes?: string[]): Promise<Match[]> {
  const list = codes?.length ? LEAGUES.filter((l) => codes.includes(l.code)) : LEAGUES;
  /* Concorrência baixa (2) + espaçamento: rajadas de ~24 requests simultâneas
     fazem o Akamai do ESPN devolver 403 para o IP inteiro. Sequencial demora
     ~8s, mas o resultado fica em cache por 45s. */
  const saida: Match[][] = new Array(list.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(2, list.length) }, async () => {
    while (cursor < list.length) {
      const i = cursor++;
      saida[i] = await getScoreboard(list[i].code, dateYmd);
      await new Promise((r) => setTimeout(r, 120));
    }
  });
  await Promise.all(workers);
  const all = saida.flat();
  return all.sort((a, b) => leagueInfo(a.league).priority - leagueInfo(b.league).priority || a.date.localeCompare(b.date));
}

export function matchFromSummary(sm: any, league: string, id: string): Match {
  const comp = sm?.header?.competitions?.[0] || {};
  return normEvent({ id, date: comp?.date || comp?.startDate || new Date().toISOString(), status: comp?.status || { type: { state: "pre" } }, competitions: [comp] }, league);
}

export async function getSummaryRaw(league: string, id: string, state = "pre") {
  const ttl = state === "in" ? 30000 : state === "post" ? 3600000 : 300000;
  return espnGet(`/${league}/summary?event=${id}`, ttl);
}

const STAT_LABELS: Record<string, string> = {
  possessionPct: "Posse de bola", totalShots: "Finalizações", shotsOnTarget: "Chutes no gol", wonCorners: "Escanteios",
  foulsCommitted: "Faltas cometidas", offsides: "Impedimentos", yellowCards: "Cartões amarelos", redCards: "Cartões vermelhos",
  saves: "Defesas do goleiro", totalPasses: "Passes totais", accuratePasses: "Passes certos", passPct: "Precisão de passe",
  totalTackles: "Desarmes", interceptions: "Interceptações", totalClearance: "Afastamentos", blockedShots: "Chutes bloqueados",
  totalCrosses: "Cruzamentos", penaltyKickGoals: "Gols de pênalti",
};
export const STATS_ORDER = ["possessionPct", "totalShots", "shotsOnTarget", "wonCorners", "foulsCommitted", "offsides", "yellowCards", "redCards", "saves", "passPct", "totalPasses", "totalTackles", "interceptions", "totalClearance", "totalCrosses", "blockedShots"];

export function mapEventType(t: string): string | null {
  const s = (t || "").toLowerCase();
  if (s.includes("own")) return "own";
  if (s.includes("penalty") && (s.includes("miss") || s.includes("saved"))) return "pen_miss";
  if (s.includes("penalty") && s.includes("scored")) return "pen";
  if (s === "goal" || s.includes("goal")) return "goal";
  if (s.includes("yellow") && s.includes("red")) return "red";
  if (s.includes("yellow")) return "yellow";
  if (s.includes("red")) return "red";
  if (s.includes("substitution")) return "sub";
  if (s.includes("var")) return "var";
  return null;
}

export type MEvent = { minute: string; period: number; type: string; side: "home" | "away"; teamId: string; player: string; assist?: string; playerOut?: string; score?: string; text?: string };

export function normEvents(sm: any, homeId: string, awayId: string) {
  const raw = sm?.keyEvents || sm?.header?.competitions?.[0]?.details || [];
  const out: MEvent[] = [];
  let h = 0, a = 0;
  for (const e of raw) {
    const type = mapEventType(e?.type?.type || e?.type?.text || "");
    if (!type) continue;
    const teamId = String(e?.team?.id || "");
    const side: "home" | "away" = teamId === homeId ? "home" : "away";
    const isGoal = type === "goal" || type === "pen" || type === "own";
    let score: string | undefined;
    if (isGoal) {
      const scoringSide = type === "own" ? (side === "home" ? "away" : "home") : side;
      if (scoringSide === "home") h++; else a++;
      score = `${h}-${a}`;
    }
    let player = e?.participants?.[0]?.athlete?.displayName || "";
    let assist = e?.participants?.[1]?.athlete?.displayName;
    let playerOut: string | undefined;
    if (type === "sub") {
      const m = (e?.text || "").match(/Substitution,.*?\.\s*(.+?)\s+replaces\s+(.+?)\./);
      if (m) { player = m[1]; playerOut = m[2]; }
      else playerOut = e?.participants?.[1]?.athlete?.displayName;
      assist = undefined;
    }
    if (!player && e?.shortText) player = e.shortText;
    out.push({
      minute: e?.clock?.displayValue || (e?.clock?.value ? `${Math.floor(e.clock.value / 60)}'` : ""),
      period: e?.period?.number || 1, type, side, teamId, player, assist: type === "sub" ? undefined : assist, playerOut, score, text: e?.shortText || e?.text,
    });
  }
  return out;
}

export function normStats(sm: any, homeId: string) {
  const teams = sm?.boxscore?.teams || [];
  const hs = teams.find((t: any) => String(t?.team?.id) === homeId) || teams[0];
  const as_ = teams.find((t: any) => String(t?.team?.id) !== homeId) || teams[1];
  const get = (t: any, n: string) => t?.statistics?.find((s: any) => s.name === n)?.displayValue ?? null;
  return STATS_ORDER.filter((k) => get(hs, k) != null || get(as_, k) != null).map((k) => ({
    key: k, label: STAT_LABELS[k] || k, home: get(hs, k), away: get(as_, k),
  }));
}

export function normLineups(sm: any, homeId: string) {
  const build = (r: any) => {
    if (!r) return null;
    const all = (r.roster || []).map((p: any) => ({
      name: p?.athlete?.displayName || "", short: p?.athlete?.shortName || p?.athlete?.lastName || p?.athlete?.displayName || "",
      jersey: p?.jersey || "", place: Number(p?.formationPlace || 0), starter: !!p?.starter, captain: !!p?.captain,
      pos: p?.position?.abbreviation || "", photo: p?.athlete?.headshot?.href || "", subIn: !!p?.subbedIn, subOut: !!p?.subbedOut,
    }));
    return { teamId: String(r?.team?.id || ""), formation: r?.formation || "", xi: all.filter((p: any) => p.starter && p.place > 0).sort((a: any, b: any) => a.place - b.place), bench: all.filter((p: any) => !p.starter) };
  };
  const rs = sm?.rosters || [];
  const home = build(rs.find((r: any) => String(r?.team?.id) === homeId));
  const away = build(rs.find((r: any) => String(r?.team?.id) !== homeId));
  return { home, away, official: !!(home?.xi?.length && away?.xi?.length) };
}

export function normH2H(sm: any) {
  const series = (sm?.seasonseries || []).find((s: any) => s?.type === "head-to-head") || sm?.seasonseries?.[0];
  const events = series?.events || [];
  const games = events.map((e: any) => {
    const cs = e?.competitors || [];
    const hh = cs.find((c: any) => c.homeAway === "home") || cs[0];
    const aa = cs.find((c: any) => c.homeAway === "away") || cs[1];
    if (!hh || !aa) return null;
    return {
      id: String(e.id), date: e.date, league: e?.leagueName || e?.leagueAbbreviation || "",
      homeId: String(hh?.id || hh?.team?.id || ""), awayId: String(aa?.id || aa?.team?.id || ""),
      homeName: hh?.team?.displayName || hh?.displayName || "", awayName: aa?.team?.displayName || aa?.displayName || "",
      homeLogo: hh?.team?.logo || "", awayLogo: aa?.team?.logo || "",
      homeScore: Number(hh?.score?.value ?? hh?.score ?? 0), awayScore: Number(aa?.score?.value ?? aa?.score ?? 0),
    };
  }).filter(Boolean);
  return { summary: series?.shortSummary || "", games };
}

export function normForm(sm: any, homeId: string) {
  const parse = (block: any) => (block?.events || []).map((e: any) => ({
    result: e?.gameResult || "", score: e?.score || "", opp: e?.opponent?.abbreviation || e?.opponent?.displayName || "",
    oppLogo: e?.opponent?.logo || "", date: e?.gameDate || "", id: String(e?.id || ""), atVs: e?.atVs || "",
  })).slice(0, 5);
  const l5 = sm?.lastFiveGames || [];
  return { home: parse(l5.find((b: any) => String(b?.team?.id) === homeId) || l5[0]), away: parse(l5.find((b: any) => String(b?.team?.id) !== homeId) || l5[1]) };
}

const americanToDec = (ml: any) => { const n = Number(ml); if (!n) return null; return n > 0 ? +(1 + n / 100).toFixed(2) : +(1 + 100 / Math.abs(n)).toFixed(2); };
export function normOdds(sm: any) {
  const o = sm?.pickcenter?.[0] || sm?.odds?.[0];
  if (!o) return null;
  return {
    provider: o?.provider?.name || "Mercado", details: o?.details || "",
    home: americanToDec(o?.homeTeamOdds?.moneyLine ?? o?.homeTeamOdds?.odds?.value), draw: americanToDec(o?.drawOdds?.moneyLine ?? o?.drawOdds?.value),
    away: americanToDec(o?.awayTeamOdds?.moneyLine ?? o?.awayTeamOdds?.odds?.value),
    ou: o?.overUnder ?? null, over: americanToDec(o?.overOdds), under: americanToDec(o?.underOdds),
  };
}

/* Classificação: Football-Data.org primária; ESPN é o fallback.
   Mantém o mesmo shape { name, rows[] } para todos os consumidores existentes
   (listStrategy, supertips, api/standings, TabelaTab). */
async function espnStandings(league: string) {
  try {
    const data = await fetchJson(`https://site.api.espn.com/apis/v2/sports/soccer/${league}/standings`, {}, 1800000);
    const groups = data?.children || [];
    return groups.map((g: any) => ({
      name: g?.name || "Classificação",
      rows: (g?.standings?.entries || []).map((en: any) => {
        const st = (n: string) => en?.stats?.find((s: any) => s.name === n)?.value ?? 0;
        return { teamId: String(en?.team?.id), name: en?.team?.displayName, short: en?.team?.shortDisplayName, logo: en?.team?.logos?.[0]?.href || "", rank: st("rank"), gp: st("gamesPlayed"), w: st("wins"), d: st("ties"), l: st("losses"), gf: st("pointsFor"), ga: st("pointsAgainst"), gd: st("pointDifferential"), pts: st("points") };
      }),
    }));
  } catch { return []; }
}

export async function getStandings(league: string) {
  const { standingsComFallback } = await import("./providers");
  const res = await standingsComFallback(league, () => espnStandings(league));
  return res.data;
}

/* Versão detalhada (com a trilha de qual fonte respondeu) usada pela rota. */
export async function getStandingsComFonte(league: string) {
  const { standingsComFallback } = await import("./providers");
  return standingsComFallback(league, () => espnStandings(league));
}

export async function getLeaders(league: string) {
  try {
    const data = await espnGet(`/${league}/statistics`, 1800000);
    return { season: data?.season?.displayName || data?.season?.year || "", stats: data?.stats || [] };
  } catch { return { season: "", stats: [] }; }
}

export async function getTeamInfo(league: string, teamId: string) {
  const data = await espnGet(`/${league}/teams/${teamId}`, 1800000);
  const t = data?.team || {};
  return {
    id: String(t.id), name: t.displayName, short: t.shortDisplayName, logo: t.logos?.[0]?.href || "", color: t.color || "23e57b",
    venue: t?.franchise?.venue?.fullName || "", record: t?.record?.items?.[0]?.summary || "", standing: t?.standingSummary || "",
    nextEvent: t?.nextEvent?.[0] ? normEvent(t.nextEvent[0], league) : null,
  };
}

export async function getSchedule(league: string, teamId: string, season?: number): Promise<{ season: number | null; events: Match[] }> {
  const url = `/${league}/teams/${teamId}/schedule${season ? `?season=${season}` : ""}`;
  try {
    const data = await espnGet(url, 1800000);
    return { season: data?.season?.year || null, events: (data?.events || []).map((e: any) => normEvent(e, league)) };
  } catch { return { season: null, events: [] as Match[] }; }
}

export type HistGame = {
  id: string; date: string; league: string; home: boolean;
  opp: { id: string; name: string; short: string; logo: string };
  gf: number; ga: number; res: "V" | "E" | "D"; htGf: number | null; htGa: number | null;
  corners: number | null; fouls: number | null; yellow: number | null; red: number | null; offsides: number | null;
  sot: number | null; shots: number | null; poss: number | null; xgEst: number | null;
  oppCorners: number | null; oppSot: number | null; oppFouls: number | null; oppYellow: number | null;
  /** xG estimado pelo adversário (mesma fórmula, chutes do adversário). */
  oppXgEst: number | null;
  /** xG OFICIAL do time (API-Football) — preenchido fora da ESPN, quando disponível. */
  xgF?: number | null;
  /** xG OFICIAL sofrido (API-Football). */
  xgA?: number | null;
  /** Fonte do xG oficial aplicado neste histórico. */
  xgFonte?: "api-football" | null;
  events: { type: string; player: string; assist?: string; period: number; side: string; minute: number }[];
};

export async function getTeamHistory(league: string, teamId: string, n = 10): Promise<{ games: HistGame[]; baseParcial: boolean; source: string }> {
  let { season, events } = await getSchedule(league, teamId);
  let finished = events.filter((e) => e.finished).sort((a, b) => b.date.localeCompare(a.date));
  if (finished.length < 5 && season) {
    const prev = await getSchedule(league, teamId, season - 1);
    const prevFin = prev.events.filter((e) => e.finished).sort((a, b) => b.date.localeCompare(a.date));
    finished = [...finished, ...prevFin];
  }
  finished = finished.slice(0, n);
  const games: HistGame[] = [];
  await Promise.all(finished.map(async (m) => {
    const isHome = m.home.id === String(teamId);
    const me = isHome ? m.home : m.away, opp = isHome ? m.away : m.home;
    let sm: any = null;
    try { sm = await getSummaryRaw(m.league, m.id, "post"); } catch {}
    const evs = sm ? normEvents(sm, m.home.id, m.away.id) : [];
    const stats = sm ? normStats(sm, m.home.id) : [];
    const sv = (k: string, side: "home" | "away") => { const row = stats.find((s: any) => s.key === k); const v = row ? (side === "home" ? row.home : row.away) : null; return v == null ? null : parseFloat(String(v).replace("%", "")); };
    const mySide = isHome ? "home" : "away", opSide = isHome ? "away" : "home";
    const htGoals = evs.filter((e) => e.period === 1 && ["goal", "pen", "own"].includes(e.type));
    let htGf: number | null = null, htGa: number | null = null;
    if (sm && evs.some((e) => ["goal", "pen", "own"].includes(e.type))) {
      htGf = htGoals.filter((e) => (e.type === "own" ? e.side !== mySide : e.side === mySide)).length;
      htGa = htGoals.filter((e) => (e.type === "own" ? e.side === mySide : e.side !== mySide)).length;
    } else if (sm) { htGf = 0; htGa = 0; }
    const gf = me.score ?? 0, ga = opp.score ?? 0;
    const sot = sv("shotsOnTarget", mySide), shots = sv("totalShots", mySide);
    const oppSot = sv("shotsOnTarget", opSide), oppShots = sv("totalShots", opSide);
    games.push({
      id: m.id, date: m.date, league: m.league, home: isHome,
      opp: { id: opp.id, name: opp.name, short: opp.short, logo: opp.logo },
      gf, ga, res: gf > ga ? "V" : gf === ga ? "E" : "D", htGf, htGa,
      corners: sv("wonCorners", mySide), fouls: sv("foulsCommitted", mySide), yellow: sv("yellowCards", mySide), red: sv("redCards", mySide),
      offsides: sv("offsides", mySide), sot, shots, poss: sv("possessionPct", mySide),
      xgEst: sot != null ? +(sot * 0.3 + Math.max(0, (shots ?? 0) - sot) * 0.06).toFixed(2) : null,
      oppXgEst: oppSot != null ? +(oppSot * 0.3 + Math.max(0, (oppShots ?? 0) - oppSot) * 0.06).toFixed(2) : null,
      oppCorners: sv("wonCorners", opSide), oppSot: sv("shotsOnTarget", opSide), oppFouls: sv("foulsCommitted", opSide),
      oppYellow: sv("yellowCards", opSide),
      events: evs.filter((e) => ["goal", "pen", "own", "yellow", "red"].includes(e.type)).map((e) => ({ type: e.type, player: e.player, assist: e.assist, period: e.period, side: e.side, minute: parseInt(String(e.minute).replace(/\D/g, ""), 10) || 0 })),
    });
  }));
  games.sort((a, b) => b.date.localeCompare(a.date));
  return { games, baseParcial: games.length < 5, source: "ESPN" };
}