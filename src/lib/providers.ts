import { fetchJson } from "./cache";
import { getKey } from "./keys";

/* ===== Football-Data.org (token colado no Admin) ===== */
export async function fdFetch(path: string, ttl = 600000) {
  const token = await getKey("footballdata");
  if (!token) throw new Error("Chave Football-Data.org não configurada. Cole seu token no Admin → APIs.");
  return fetchJson(`https://api.football-data.org/v4${path}`, { headers: { "X-Auth-Token": token } }, ttl);
}
export async function fdCompetitions() {
  const d = await fdFetch("/competitions", 3600000);
  return (d?.competitions || []).map((c: any) => ({ id: c.id, code: c.code, name: c.name, country: c?.area?.name, emblem: c.emblem, plan: c.plan, seasons: c?.currentSeason?.startDate?.slice(0, 4) }));
}
export async function fdScorers(code: string, season?: number, limit = 50) {
  const d = await fdFetch(`/competitions/${code}/scorers?limit=${limit}${season ? `&season=${season}` : ""}`, 1800000);
  return {
    competition: d?.competition?.name || code, season: d?.season?.startDate?.slice(0, 4) || "",
    rows: (d?.scorers || []).map((s: any) => ({
      id: s?.player?.id, name: s?.player?.name, photo: "", nationality: s?.player?.nationality, position: s?.player?.position,
      team: s?.team?.name, teamId: s?.team?.id, teamLogo: s?.team?.crest, played: s?.playedMatches ?? null,
      goals: s?.goals ?? 0, assists: s?.assists ?? null, penalties: s?.penalties ?? null, source: "Football-Data.org",
    })),
  };
}

/* ===== Sportmonks v3 ===== */
export async function smFetch(path: string, ttl = 120000) {
  const token = await getKey("sportmonks");
  if (!token) throw new Error("Chave Sportmonks não configurada. Cole seu token no Admin → APIs.");
  const sep = path.includes("?") ? "&" : "?";
  return fetchJson(`https://api.sportmonks.com/v3/football${path}${sep}api_token=${token}`, {}, ttl, `sm:${path}`);
}
export async function smToday() {
  const d = await smFetch(`/fixtures/date/${new Date().toISOString().slice(0, 10)}?include=participants;league;scores;state`, 60000);
  return (d?.data || []).map((f: any) => {
    const parts = f.participants || [];
    const home = parts.find((p: any) => p?.meta?.location === "home") || parts[0] || {};
    const away = parts.find((p: any) => p?.meta?.location === "away") || parts[1] || {};
    const st = (f?.state?.state || "").toLowerCase();
    const isLive = ["inplay", "live", "ht"].includes(st) || [2, 3, 4, 5, 6, 7, 22, 25].includes(f?.state_id);
    const isFinished = ["ft", "finished", "aet", "ft_pen"].includes(st) || f?.state_id === 5;
    return {
      kickoff_utc: f?.starting_at ? new Date(f.starting_at.replace(" ", "T") + "Z").toISOString() : f?.starting_at,
      status: isLive ? "live" : isFinished ? "finished" : "scheduled", isLive, isFinished,
      id: f?.id, homeTeam: home?.name, awayTeam: away?.name, homeTeamLogo: home?.image_path, awayTeamLogo: away?.image_path,
      leagueId: f?.league_id, league: f?.league?.name, country: f?.league?.country_id, basicStats: null,
    };
  });
}
export async function smFixtureStats(fixtureId: string | number) {
  const d = await smFetch(`/fixtures/${fixtureId}?include=statistics.type;events`, 30000);
  const stats = d?.data?.statistics || [];
  const find = (names: string[], loc: string) => {
    const s = stats.find((x: any) => x?.location === loc && names.some((n) => (x?.type?.name || "").toLowerCase().includes(n)));
    return s?.data?.value ?? null;
  };
  return {
    xgHome: find(["expected goal", "xg"], "home"), xgAway: find(["expected goal", "xg"], "away"),
    possessionHome: find(["ball possession", "possession"], "home"), possessionAway: find(["ball possession", "possession"], "away"),
    shotsHome: find(["shots total", "total shots"], "home"), shotsAway: find(["shots total", "total shots"], "away"),
    sotHome: find(["shots on target"], "home"), sotAway: find(["shots on target"], "away"),
    cornersHome: find(["corners"], "home"), cornersAway: find(["corners"], "away"),
    dangerousHome: find(["dangerous attack"], "home"), dangerousAway: find(["dangerous attack"], "away"),
  };
}

/* ===== Bzzoiro (fallback de probabilidades) ===== */
export async function bzFetch(path: string, ttl = 120000) {
  const token = await getKey("bzzoiro");
  if (!token) throw new Error("Chave Bzzoiro não configurada. Cole seu token no Admin → APIs.");
  return fetchJson(`https://sports.bzzoiro.com/api${path}`, { headers: { Authorization: `Bearer ${token}` } }, ttl);
}

/* ===== Teste de conexão usado pelo Admin ===== */
export async function testProvider(provider: string): Promise<{ ok: boolean; message: string; sample?: any }> {
  try {
    if (provider === "espn") {
      const d = await fetchJson("https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard", {}, 30000);
      return { ok: true, message: `ESPN online — ${d?.events?.length ?? 0} jogos na rodada atual, sem chave.`, sample: { ligas: 17 } };
    }
    if (provider === "footballdata") {
      const comps = await fdCompetitions();
      return { ok: true, message: `Football-Data.org OK — ${comps.length} competições disponíveis no seu plano.`, sample: comps.slice(0, 30) };
    }
    if (provider === "sportmonks") {
      const d = await smFetch("/leagues?per_page=5", 30000);
      return { ok: true, message: `Sportmonks OK — token válido. Ex.: ${(d?.data || []).slice(0, 3).map((l: any) => l.name).join(", ")}`, sample: (d?.data || []).slice(0, 20).map((l: any) => ({ id: l.id, name: l.name, country: l.country_id })) };
    }
    if (provider === "bzzoiro") {
      const token = await getKey("bzzoiro");
      if (!token) throw new Error("Cole o token primeiro.");
      const res = await fetch("https://sports.bzzoiro.com/api/v1/matches", { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
      return { ok: res.ok, message: res.ok ? "Bzzoiro conectado — endpoint respondeu 200." : `Bzzoiro respondeu HTTP ${res.status}. Verifique o token/plano.`, sample: { status: res.status } };
    }
    if (provider === "onesignal_rest") {
      const token = await getKey("onesignal_rest");
      if (!token) throw new Error("Cole a REST API Key primeiro.");
      const res = await fetch("https://api.onesignal.com/apps/f06a705d-ebd0-4390-9a11-207fe769b81d", { headers: { Authorization: `Key ${token}` } });
      return { ok: res.ok, message: res.ok ? "OneSignal REST OK — push do servidor habilitado." : `OneSignal respondeu HTTP ${res.status}.`, sample: { status: res.status } };
    }
    return { ok: false, message: "Provedor desconhecido." };
  } catch (e: any) {
    return { ok: false, message: e?.message || "Falha na conexão." };
  }
}