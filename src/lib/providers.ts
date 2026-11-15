import { fetchJson } from "./cache";
import { getKey } from "./keys";

/* =======================================================================
   NAVOR DE RESILIÊNCIA — toda cascata registra quem respondeu e por quê
   a fonte anterior falhou. Nenhuma cascata inventa dado: se todas
   falharem, devolve vazio + motivo.
   ======================================================================= */
export type Cascade<T> = { data: T; source: string; attempts: { provider: string; ok: boolean; reason?: string }[] };

const motivo = (e: any) => String(e?.message || e || "falha").slice(0, 160);

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

/* ===== Sportmonks v3 ===== */export async function smFetch(path: string, ttl = 120000) {
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

/*
 * Bzzoiro v2 — base e esquema de auth oficiais.
 * A doc manda `Authorization: Token <key>`; `Bearer` segue aceito por
 * integrações legadas, então tentamos na ordem e memorizamos o que funcionou.
 */
let bzAuthScheme: "Token" | "Bearer" = "Token";

export async function bzFetchV2(path: string, ttl = 60000) {
  const token = await getKey("bzzoiro");
  if (!token) throw new Error("Chave Bzzoiro não configurada. Cole seu token no Admin → APIs.");
  const url = `https://sports.bzzoiro.com/api/v2${path}`;
  try {
    return await fetchJson(url, { headers: { Authorization: `${bzAuthScheme} ${token}`, Accept: "application/json" } }, ttl, `bz2:${bzAuthScheme}:${path}`);
  } catch (e) {
    const alt = bzAuthScheme === "Token" ? "Bearer" : "Token";
    try {
      const r = await fetchJson(url, { headers: { Authorization: `${alt} ${token}`, Accept: "application/json" } }, ttl, `bz2:${alt}:${path}`);
      bzAuthScheme = alt as "Token" | "Bearer";
      return r;
    } catch {
      throw e;
    }
  }
}

/* =======================================================================
   CLASSIFICAÇÃO — Football-Data.org primária, ESPN como fallback
   ======================================================================= */
const FD_COMP: Record<string, string> = {
  "eng.1": "PL", "esp.1": "PD", "ita.1": "SA", "ger.1": "BL1", "fra.1": "FL1",
  "bra.1": "BSA", "por.1": "PPL", "ned.1": "DED", "uefa.champions": "CL",
  "eng.2": "ELC", "ger.2": "BL2", "fra.2": "FL2", "ita.2": "SA_AUS",
};

export const fdCompetitionCode = (league: string) => FD_COMP[league] || null;

export type StandingRow = {
  teamId: string; name: string; short: string; logo: string;
  rank: number; teamRef?: string; teamShort?: string;
  gp: number; w: number; d: number; l: number;
  gf: number; ga: number; gd: number; pts: number; form?: string;
};
export type StandingGroup = { name: string; rows: StandingRow[] };

export async function fdStandings(league: string): Promise<StandingGroup[]> {
  const code = fdCompetitionCode(league);
  if (!code) throw new Error(`Competição ${league} não mapeada no Football-Data.org.`);
  const d = await fdFetch(`/competitions/${code}/standings`, 900000);
  const standings = d?.standings || [];
  return standings
    .filter((s: any) => (s?.type || "TOTAL") === "TOTAL")
    .map((s: any, gi: number) => ({
      name: s?.group || (standings.length > 1 ? `Grupo ${gi + 1}` : "Classificação"),
      rows: (s?.table || []).map((t: any) => ({
        /* IDs do FD são outro espaço de nomes — guardamos o nome p/ reconciliação */
        teamId: String(t?.team?.id ?? ""),
        teamRef: t?.team?.name || "",
        teamShort: t?.team?.tla || t?.team?.shortName || "",
        name: t?.team?.name || "",
        short: t?.team?.tla || t?.team?.shortName || "",
        logo: t?.team?.crest || "",
        rank: Number(t?.position ?? 0),
        gp: Number(t?.playedGames ?? 0),
        w: Number(t?.won ?? 0), d: Number(t?.draw ?? 0), l: Number(t?.lost ?? 0),
        gf: Number(t?.goalsFor ?? 0), ga: Number(t?.goalsAgainst ?? 0),
        gd: Number(t?.goalDifference ?? 0), pts: Number(t?.points ?? 0),
        form: t?.form || "",
      })),
    }))
    .filter((g: StandingGroup) => g.rows.length > 0);
}

/* Normalização de nome de clube para reconciliação entre fontes.
   Remove sufixos societários (FC/CF/SC/AC/FR/EC/SA/CD/FBC/FBPA) e siglas
   de estado brasileiras (Atlético-MG ↔ Atlético Mineiro). */
const CLUB_NOISE = /\b(fc|cf|sc|ac|afc|ec|fr|cd|sa|sad|fbc|fbpa|club|clube|de|da|do|the|mg|sp|rj|rs|pr|ba|pe|ce|go|mt|ms|pa|am|es|df|al|pb|rn|pi|ma|to|ro|rr|ap)\b/g;

const clubKey = (s: string) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(CLUB_NOISE, " ")
    .replace(/\s+/g, "")
    .trim();

/*
 * Apelidos: nomes que NÃO compartilham raiz entre Football-Data e ESPN.
 * Casos reais do Brasileirão e principais ligas europeias.
 * Chave = forma normalizada → valor = chave canônica única.
 */
const CLUB_ALIAS: Record<string, string> = {
  /* --- Brasil: FD usa nome societário, ESPN usa apelido --- */
  caparanaense: "athleticoparanaense",
  athleticoparanaense: "athleticoparanaense",
  camineiro: "atleticomg",
  atleticomineiro: "atleticomg",
  atleticomg: "atleticomg",
  rbbragantino: "bragantino",
  redbullbragantino: "bragantino",
  bragantino: "bragantino",
  cluberemo: "remo",
  remo: "remo",
  /* --- Europa --- */
  wolves: "wolverhampton",
  wolverhamptonwanderers: "wolverhampton",
  spurs: "tottenham",
  tottenhamhotspur: "tottenham",
  brightonhovealbion: "brighton",
  westhamunited: "westham",
  westham: "westham",
  bayernmunich: "bayern",
  bayernmunchen: "bayern",
  bayern: "bayern",
  inter: "internazionale",
  intermilan: "internazionale",
  internazionale: "internazionale",
  acmilan: "acmilan",
  psg: "parissaintgermain",
  parissaintgermain: "parissaintgermain",
  newcastleunited: "newcastle",
  nottinghamforest: "nottinghamforest",
};

const clubAlias = (k: string) => CLUB_ALIAS[k] || k;

/**
 * Reescreve as linhas do Football-Data com o teamId/logo da ESPN, casando por nome.
 * Sem isso, listStrategy/supertips/TabelaTab (que buscam por ID da ESPN)
 * passariam a não achar o time e as estratégias sumiriam sem erro.
 */
async function reconciliarComEspn(
  groups: StandingGroup[],
  espnFetcher: () => Promise<StandingGroup[]>
): Promise<{ groups: StandingGroup[]; reconciled: number; total: number }> {
  const total = groups.reduce((s, g) => s + g.rows.length, 0);
  let espnGroups: StandingGroup[] = [];
  try {
    espnGroups = await espnFetcher();
  } catch {
    espnGroups = [];
  }
  const byName = new Map<string, { teamId: string; logo: string; short: string }>();
  for (const g of espnGroups) {
    for (const r of g.rows || []) {
      if (!r?.teamId) continue;
      const k = clubAlias(clubKey(r.name));
      /* preferimos a forma exata; guarda a primeira e uma versão "começa com"
         (sem sigla de estado) como segundo passe. */
      if (!byName.has(k)) byName.set(k, { teamId: String(r.teamId), logo: r.logo || "", short: r.short || "" });
    }
  }
  let reconciled = 0;
  const out = groups.map((g) => ({
    ...g,
    /* groupName do FD → nome amigável preservado */
    rows: g.rows.map((r) => {
      const k1 = clubAlias(clubKey(r.name));
      const k2 = clubAlias(clubKey(r.teamRef || ""));
      let hit = byName.get(k1) || byName.get(k2);
      if (!hit) {
        /* último passe: um nome contido no outro, mas só com ≥5 chars para
           evitar falso positivo (ex.: "Sport" ⊂ "Sporting"). */
        for (const [k, v] of byName) {
          if (k.length >= 5 && k1.length >= 5 && (k.includes(k1) || k1.includes(k))) {
            hit = v;
            break;
          }
        }
      }
      if (!hit) return r;
      reconciled++;
      return { ...r, teamId: hit.teamId, logo: r.logo || hit.logo, short: r.short || hit.short };
    }),
  }));
  return { groups: out, reconciled, total };
}

export async function standingsComFallback(
  league: string,
  espnFetcher: () => Promise<StandingGroup[]>,
  opts: { reconcile?: boolean } = {}
): Promise<Cascade<StandingGroup[]>> {
  const attempts: Cascade<StandingGroup[]>["attempts"] = [];
  let fdKey: string | null = null;
  try {
    fdKey = await getKey("footballdata");
  } catch {
    fdKey = null;
  }
  if (fdKey && fdCompetitionCode(league)) {
    try {
      const raw = await fdStandings(league);
      if (raw.length) {
        attempts.push({ provider: "footballdata", ok: true });
        if (opts.reconcile === false) return { data: raw, source: "Football-Data.org", attempts };
        const { groups, reconciled, total } = await reconciliarComEspn(raw, espnFetcher);
        /* Se quase nada casou, os IDs ficariam órfãos: melhor a tabela da ESPN. */
        const cobertura = total ? reconciled / total : 0;
        if (cobertura < 0.5) {
          attempts.push({ provider: "footballdata", ok: false, reason: `só ${reconciled}/${total} times casaram com a ESPN` });
        } else {
          return {
            data: groups,
            source: reconciled === total ? "Football-Data.org" : `Football-Data.org (${reconciled}/${total} casados c/ ESPN)`,
            attempts,
          };
        }
      } else {
        attempts.push({ provider: "footballdata", ok: false, reason: "tabela vazia" });
      }
    } catch (e) {
      attempts.push({ provider: "footballdata", ok: false, reason: motivo(e) });
    }
  } else {
    attempts.push({
      provider: "footballdata",
      ok: false,
      reason: !fdKey ? "chave não configurada" : `competição ${league} não mapeada`,
    });
  }
  try {
    const data = await espnFetcher();
    attempts.push({ provider: "espn", ok: data.length > 0, reason: data.length ? undefined : "tabela vazia" });
    return { data, source: "ESPN (fallback)", attempts };
  } catch (e) {
    attempts.push({ provider: "espn", ok: false, reason: motivo(e) });
    return { data: [], source: "indisponível", attempts };
  }
}

/* =======================================================================
   LIVE GAMES — ESPN prioritária, Bzzoiro como fallback imediato
   ======================================================================= */
export type LiveGame = {
  id: string; leagueId: string; homeTeam: string; awayTeam: string;
  homeScore: number | null; awayScore: number | null;
  status: string; minute: string | null; date: string | null;
  homeLogo?: string; awayLogo?: string; raw?: any;
};

export async function bzLiveGames(): Promise<LiveGame[]> {
  const d = await bzFetchV2("/events/live/", 20000);
  const rows: any[] = d?.results || d?.data || (Array.isArray(d) ? d : []);
  return rows.map((e: any) => ({
    id: String(e?.id ?? ""),
    leagueId: String(e?.league_id ?? ""),
    homeTeam: e?.home_team?.name || e?.home_team || "",
    awayTeam: e?.away_team?.name || e?.away_team || "",
    homeScore: e?.home_score ?? null,
    awayScore: e?.away_score ?? null,
    status: String(e?.status || "live"),
    minute: e?.minute != null ? String(e.minute) : e?.time_elapsed != null ? `${e.time_elapsed}'` : null,
    date: e?.event_date || null,
    homeLogo: e?.home_team?.logo || e?.home_team_logo || undefined,
    awayLogo: e?.away_team?.logo || e?.away_team_logo || undefined,
    raw: e,
  }));
}

/** ESPN primeiro; se ela falhar ou devolver vazio o Bzzoiro assume na hora. */
export async function liveMatchesComFallback(
  espnFetcher: () => Promise<LiveGame[]>
): Promise<Cascade<LiveGame[]>> {
  const attempts: Cascade<LiveGame[]>["attempts"] = [];
  try {
    const data = await espnFetcher();
    attempts.push({ provider: "espn", ok: data.length > 0, reason: data.length ? undefined : "sem jogos ao vivo" });
    if (data.length) return { data, source: "ESPN", attempts };
  } catch (e) {
    attempts.push({ provider: "espn", ok: false, reason: motivo(e) });
  }
  try {
    const data = await bzLiveGames();
    attempts.push({ provider: "bzzoiro", ok: data.length > 0, reason: data.length ? undefined : "sem jogos ao vivo" });
    return { data, source: data.length ? "Bzzoiro (fallback)" : "indisponível", attempts };
  } catch (e) {
    attempts.push({ provider: "bzzoiro", ok: false, reason: motivo(e) });
    return { data: [], source: "indisponível", attempts };
  }
}

/* =======================================================================
   ESTATÍSTICAS POR JOGADOR — Sportmonks → Bzzoiro → indisponível
   ======================================================================= */
export type PlayerStatRow = {
  id: string; name: string; team?: string; photo?: string; position?: string;
  total: number; average: number | null; values: (number | null)[];
  gameCount?: number; source: string;
};

/* Métricas pedidas → nome EXATO do campo no log por partida do Bzzoiro.
   Confirmados em /api/v2/players/{id}/stats/ (75 campos):
   total_shots · fouls · saves · goals · goal_assist · yellow_card · red_card */
const BZ_METRICS: Record<string, string[]> = {
  finalizacoes: ["total_shots", "shots_on_target"],
  faltas: ["fouls", "was_fouled"],
  defesas: ["saves"],
  gols: ["goals"],
  assistencias: ["goal_assist"],
  cartoes: ["yellow_card", "red_card"],
};

/* Soma métricas de cards (amarelo + vermelho) em vez de pegar a primeira. */
const BZ_SUM_MULTI = new Set<string>(["cartoes"]);

function pickMetric(row: any, cat: string): number | null {
  const keys = BZ_METRICS[cat] || [];
  const get = (k: string): number | null => {
    const v = row?.[k] ?? row?.stats?.[k];
    if (v == null || Number.isNaN(Number(v))) return null;
    return Number(v);
  };
  if (BZ_SUM_MULTI.has(cat)) {
    const vals = keys.map(get).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) : null;
  }
  for (const k of keys) {
    const v = get(k);
    if (v != null) return v;
  }
  return null;
}

/**
 * Log de estatísticas por jogador vindo do Bzzoiro.
 * Resolve o elenco por nome do time e lê /players/{id}/stats/ de cada atleta.
 * Devolve [] (nunca números inventados) se a fonte recusar/vier vazia.
 */
export async function bzPlayerStatLog(
  cat: string,
  teamName: string,
  limit = 5
): Promise<PlayerStatRow[]> {
  if (!teamName) return [];

  /* 1) achar o time no Bzzoiro (match por nome, tolerante a caixa/acento) */
  const norm = (s: string) =>
    String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const teamRes = await bzFetchV2(`/teams/?name=${encodeURIComponent(teamName)}&limit=5`, 3600000);
  const teams: any[] = teamRes?.results || teamRes?.data || [];
  const team =
    teams.find((t: any) => norm(t?.name) === norm(teamName)) ||
    teams.find((t: any) => norm(t?.name).includes(norm(teamName).split(" ")[0]));
  if (!team?.id) return [];

  /* 2) elenco — a rota /squad/ devolve { team_id, count, players:[] },
     /players/ devolve { count, results:[] }. Cobrimos os dois formatos. */
  const squadRes = await bzFetchV2(`/teams/${team.id}/squad/`, 1800000);
  const squad: any[] =
    squadRes?.players ||
    squadRes?.results ||
    squadRes?.data ||
    (Array.isArray(squadRes) ? squadRes : []);
  if (!squad.length) return [];

  /* 3) log por atleta. Para "defesas" só goleiros interessam; nas demais,
     varremos o elenco em ordem de posição (ataque/meio primeiro). */
  const isGK = (p: any) => String(p?.specific_position || p?.position || "").toUpperCase().startsWith("G");
  const ordered = cat === "defesas"
    ? squad.filter(isGK)
    : [...squad].filter((p) => String(p?.position || "").toUpperCase() !== "G");
  const cand = ordered.slice(0, 12);
  if (!cand.length) return [];

  const out: PlayerStatRow[] = [];
  let effective = 0;
  await Promise.all(
    cand.map(async (p: any) => {
      try {
        const log = await bzFetchV2(`/players/${p.id}/stats/?limit=10`, 1800000);
        const rows: any[] = log?.results || log?.data || (Array.isArray(log) ? log : []);
        if (!rows.length) return;
        const vals = rows
          .slice(0, 10)
          .map((r: any) => pickMetric(r, cat))
          .filter((v: number | null): v is number => v != null);
        if (!vals.length) return;
        effective++;
        const chronological = [...vals].reverse();
        const total = chronological.reduce((s, v) => s + v, 0);
        out.push({
          id: String(p.id),
          name: p?.name || p?.display_name || "—",
          team: team?.name || teamName,
          photo: p?.photo || p?.image || (p?.id ? `https://sports.bzzoiro.com/img/player/${p.id}/` : ""),
          position: p?.position || "",
          total,
          average: chronological.length ? +(total / chronological.length).toFixed(2) : null,
          values: chronological,
          gameCount: chronological.length,
          source: "Bzzoiro",
        });
      } catch {
        /* atleta sem log neste plano — segue */
      }
    })
  );

  if (!effective) return [];
  /* Goleiros que não atuaram (total 0) poluem a lista de Defesas — removidos.
     Aplicado a todas as categorias por consistência: card com zero não informa. */
  const positivos = out.filter((r) => r.total > 0);
  if (!positivos.length) return [];
  return positivos.sort((a, b) => b.total - a.total).slice(0, limit);
}

/** Cascata das 3 métricas que nenhuma outra fonte entrega por jogador. */
export async function playerStatsComFallback(
  cat: string,
  teamName: string,
  smFetcher: () => Promise<PlayerStatRow[] | null>
): Promise<Cascade<PlayerStatRow[] | null>> {
  const attempts: Cascade<PlayerStatRow[] | null>["attempts"] = [];
  let smKey: string | null = null;
  try {
    smKey = await getKey("sportmonks");
  } catch {
    smKey = null;
  }
  if (smKey) {
    try {
      const rows = await smFetcher();
      if (rows && rows.length) {
        attempts.push({ provider: "sportmonks", ok: true });
        return { data: rows, source: "Sportmonks", attempts };
      }
      attempts.push({ provider: "sportmonks", ok: false, reason: "sem estatística por jogador" });
    } catch (e) {
      attempts.push({ provider: "sportmonks", ok: false, reason: motivo(e) });
    }
  } else {
    attempts.push({ provider: "sportmonks", ok: false, reason: "chave não configurada" });
  }
  let bzKey: string | null = null;
  try {
    bzKey = await getKey("bzzoiro");
  } catch {
    bzKey = null;
  }
  if (bzKey) {
    try {
      const rows = await bzPlayerStatLog(cat, teamName);
      if (rows.length) {
        attempts.push({ provider: "bzzoiro", ok: true });
        return { data: rows, source: "Bzzoiro", attempts };
      }
      attempts.push({ provider: "bzzoiro", ok: false, reason: "sem dado para esta métrica" });
    } catch (e) {
      attempts.push({ provider: "bzzoiro", ok: false, reason: motivo(e) });
    }
  } else {
    attempts.push({ provider: "bzzoiro", ok: false, reason: "chave não configurada" });
  }
  return { data: null, source: "indisponível", attempts };
}

/* ===== API-Football (api-sports.io) — odds reais por partida =====
 * Auth por header `x-apisports-key` (sem Bearer e sem Content-Type).
 *
 * Limitação conhecida do plano Free (verificada em 2026-11):
 *  - `/fixtures?season=<atual>` → "Free plans do not have access to this season"
 *  - `/odds?date=` → funciona, mas exige paginar dezenas de páginas
 *  - `/odds?fixture=<id>` → funciona em 1 chamada (o caminho que usamos)
 */
const AF_BASE = "https://v3.football.api-sports.io";

export async function afFetch(path: string, ttl = 600000) {
  const key = await getKey("api-football");
  if (!key) throw new Error("Chave API-Football não configurada. Cole no Admin → APIs.");
  const d = await fetchJson(`${AF_BASE}${path}`, { headers: { "x-apisports-key": key } }, ttl, `af:${path}`);
  const errs = d?.errors;
  const hasErr = errs && (Array.isArray(errs) ? errs.length > 0 : Object.keys(errs).length > 0);
  if (hasErr) {
    const msg = Array.isArray(errs) ? errs.join("; ") : Object.values(errs).join("; ");
    throw new Error(String(msg).slice(0, 180));
  }
  return d;
}

/** Status da conta (não consome cota). */
export async function afStatus() {
  const d = await afFetch("/status", 60000);
  const r = d?.response || {};
  return {
    plan: r?.subscription?.plan || "?",
    used: r?.requests?.current ?? null,
    limitDay: r?.requests?.limit_day ?? null,
  };
}

export type OddTriple = { home: number | null; draw: number | null; away: number | null; bookmaker?: string; market?: string };

const toOdd = (v: any): number | null => {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n > 1 ? +n.toFixed(2) : null;
};

/** Extrai Casa/Empate/Fora do mercado "Match Winner". */
function extrairMatchWinner(entry: any): OddTriple | null {
  for (const b of entry?.bookmakers || []) {
    for (const bet of b?.bets || []) {
      if (!/match winner/i.test(String(bet?.name))) continue;
      const vals: any[] = bet?.values || [];
      const pick = (re: RegExp) => toOdd(vals.find((v) => re.test(String(v?.value)))?.odd);
      const home = pick(/^home$/i);
      const draw = pick(/^draw$/i);
      const away = pick(/^away$/i);
      if (home != null || draw != null || away != null) {
        return { home, draw, away, bookmaker: b?.name, market: "Match Winner" };
      }
    }
  }
  return null;
}

/**
 * Odds de uma fixture — 1 requisição.
 * `invertido` troca casa/fora quando a fonte usa mando oposto ao nosso.
 */
export async function afOddsByFixture(fixtureId: string | number, invertido = false): Promise<OddTriple | null> {
  const d = await afFetch(`/odds?fixture=${encodeURIComponent(String(fixtureId))}`, 600000);
  for (const entry of (d?.response || []) as any[]) {
    const triple = extrairMatchWinner(entry);
    if (!triple) continue;
    if (!invertido) return triple;
    return { home: triple.away, draw: triple.draw, away: triple.home, bookmaker: triple.bookmaker, market: triple.market };
  }
  return null;
}

const timeKey = (s: string) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, "")
    .trim();

/**
 * Acha a fixture casando NOME DOS TIMES + DATA.
 *
 * Usa `/fixtures?date=` (que devolve `teams.home/away.name`) e NÃO `/odds?date=`,
 * porque o payload de odds não traz nomes de time — só ids (descoberto em teste
 * real). Com o id em mãos, as odds vêm por `/odds?fixture=` em 1 requisição.
 * Retorna null quando não acha — nunca adivinha.
 */
export async function afFindFixtureId(
  homeName: string,
  awayName: string,
  isoDate: string,
  leagueHint?: number
): Promise<{ id: string; invertido: boolean } | null> {
  const day = String(isoDate).slice(0, 10);
  const hk = timeKey(homeName);
  const ak = timeKey(awayName);
  if (!day || !hk || !ak) return null;

  const d = await afFetch(`/fixtures?date=${day}`, 900000);
  const resp: any[] = d?.response || [];
  let melhor: { id: string; score: number; invertido: boolean } | null = null;

  for (const f of resp) {
    const h = timeKey(f?.teams?.home?.name || "");
    const a = timeKey(f?.teams?.away?.name || "");
    if (!h || !a) continue;
    const near = (x: string, y: string) => x === y || x.includes(y) || y.includes(x);
    /* ESPN e API-Football às vezes invertem o mando — casamos o PAR, não a ordem. */
    const mesmaOrdem = near(h, hk) && near(a, ak);
    const invertido = near(h, ak) && near(a, hk);
    if (!mesmaOrdem && !invertido) continue;
    const liga = Number(f?.league?.id || 0);
    const score =
      (h === hk ? 2 : 0) + (a === ak ? 2 : 0) +
      (invertido ? 1 : 0) +
      (leagueHint && liga === leagueHint ? 3 : 0);
    if (!melhor || score > melhor.score) melhor = { id: String(f.fixture.id), score, invertido };
  }
  return melhor ? { id: melhor.id, invertido: melhor.invertido } : null;
}

/**
 * Cascata de odds do jogo: API-Football (se casar) → ESPN (normOdds).
 * A ESPN nunca é descartada: se a API-Football não casar a fixture,
 * devolvemos as odds da ESPN e marcamos a origem.
 */
export async function oddsDoJogoComFallback(
  homeName: string,
  awayName: string,
  isoDate: string,
  espnOdds: any,
  leagueHint?: number
): Promise<{ odds: any; source: string; attempts: Cascade<any>["attempts"] }> {
  const attempts: Cascade<any>["attempts"] = [];
  let key: string | null = null;
  try {
    key = await getKey("api-football");
  } catch {
    key = null;
  }
  if (key) {
    try {
      const achado = await afFindFixtureId(homeName, awayName, isoDate, leagueHint);
      if (achado) {
        const triple = await afOddsByFixture(achado.id, achado.invertido);
        if (triple && (triple.home != null || triple.away != null)) {
          attempts.push({ provider: "api-football", ok: true });
          return {
            odds: {
              provider: triple.bookmaker || "API-Football",
              details: "Match Winner",
              home: triple.home,
              draw: triple.draw,
              away: triple.away,
              ou: espnOdds?.ou ?? null,
              over: espnOdds?.over ?? null,
              under: espnOdds?.under ?? null,
            },
            source: "API-Football",
            attempts,
          };
        }
        attempts.push({ provider: "api-football", ok: false, reason: `fixture ${achado.id} sem Match Winner` });
      } else {
        attempts.push({ provider: "api-football", ok: false, reason: "jogo não encontrado por nome+data" });
      }
    } catch (e) {
      attempts.push({ provider: "api-football", ok: false, reason: String((e as any)?.message || e).slice(0, 140) });
    }
  } else {
    attempts.push({ provider: "api-football", ok: false, reason: "chave não configurada" });
  }

  attempts.push({ provider: "espn", ok: !!espnOdds, reason: espnOdds ? undefined : "sem odds na ESPN" });
  return { odds: espnOdds || null, source: espnOdds ? "ESPN" : "indisponível", attempts };
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
    if (provider === "api-football") {
      const st = await afStatus();
      return {
        ok: true,
        message: `API-Football OK — plano ${st.plan}, ${st.used ?? "?"}/${st.limitDay ?? "?"} requisições hoje.`,
        sample: st,
      };
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
/* =======================================================================
   API-Football — estatísticas de jogador por partida (`/fixtures/players`)
   -----------------------------------------------------------------------
   Uma única requisição devolve 11 das 13 métricas da aba Estatísticas.
   "Finalizações para fora" é derivada (shots.total - shots.on).

   Custo: 1 req/jogo. Por isso NÃO é chamada em cascata por categoria — o
   consumidor (rota /stats) grava o resultado em `player_stats_cache` e passa
   a servir do banco.
   ======================================================================= */

/** Linha normalizada de jogador (contrato único da UI). */
export type AfPlayerRow = {
  id: string;
  name: string;
  team: string;
  photo: string;
  position: string;
  gols: number;
  assistencias: number;
  finalizacoes: number;
  finalizacoesNoGol: number;
  finalizacoesParaFora: number;
  passes: number;
  desarmes: number;
  interceptacoes: number;
  faltas: number;
  faltasSofridas: number;
  impedimentos: number;
  amarelos: number;
  defesas: number;
  side: "home" | "away";
};

const num = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Extrai e normaliza os jogadores de um payload de `/fixtures/players`. */
export function normAfPlayers(resp: any[]): AfPlayerRow[] {
  const out: AfPlayerRow[] = [];
  if (!Array.isArray(resp)) return out;

  for (const teamBox of resp) {
    /* `team.id` casa com o id da API-Football; o lado vem de `fixture` fora daqui. */
    const teamId = String(teamBox?.team?.id ?? "");
    const teamName = String(teamBox?.team?.name ?? "");
    for (const p of teamBox?.players || []) {
      const st = (p?.statistics || [])[0] || {};
      const shotsTotal = num(st?.shots?.total);
      const shotsOn = num(st?.shots?.on);
      const row: AfPlayerRow = {
        id: `${teamId}-${p?.player?.id ?? p?.player?.name ?? out.length}`,
        name: String(p?.player?.name ?? "—"),
        team: teamName,
        photo: String(p?.player?.photo ?? ""),
        position: String(st?.games?.position ?? ""),
        gols: num(st?.goals?.total),
        assistencias: num(st?.goals?.assists),
        finalizacoes: shotsTotal,
        finalizacoesNoGol: shotsOn,
        /* Derivada — nunca inventada: só quando o total existe. */
        finalizacoesParaFora: shotsTotal > 0 ? Math.max(0, shotsTotal - shotsOn) : 0,
        passes: num(st?.passes?.total),
        desarmes: num(st?.tackles?.total),
        interceptacoes: num(st?.tackles?.interceptions),
        faltas: num(st?.fouls?.committed),
        faltasSofridas: num(st?.fouls?.drawn),
        impedimentos: num(st?.offsides),
        amarelos: num(st?.cards?.yellow),
        defesas: num(st?.goals?.saves),
        side: "home",
      };
      out.push(row);
    }
  }
  return out;
}

/**
 * Busca `/fixtures/players` e devolve as linhas normalizadas.
 * Marca cada jogador com o lado (home/away) usando os ids do próprio fixture.
 */
export async function afPlayerStats(fixtureId: string | number): Promise<AfPlayerRow[]> {
  const fxId = encodeURIComponent(String(fixtureId));
  const d = await afFetch(`/fixtures/players?fixture=${fxId}`, 24 * 60 * 60 * 1000);
  const rows = normAfPlayers(d?.response || []);
  if (!rows.length) return [];

  /* Descobre o mando consultando o fixture (cache 24h: partida terminada não muda). */
  let homeId = "";
  try {
    const fx = await afFetch(`/fixtures?id=${fxId}`, 24 * 60 * 60 * 1000);
    homeId = String(((fx?.response || [])[0])?.teams?.home?.id ?? "");
  } catch {
    homeId = "";
  }
  if (homeId) {
    for (const r of rows) {
      const teamId = r.id.split("-")[0];
      r.side = teamId === homeId ? "home" : "away";
    }
  }
  return rows;
}

/** True quando o fixture já terminou (dado é definitivo). */
export async function afFixtureFinished(fixtureId: string | number): Promise<boolean> {
  try {
    const d = await afFetch(`/fixtures?id=${encodeURIComponent(String(fixtureId))}`, 600000);
    const f = (d?.response || [])[0];
    const st = String(f?.fixture?.status?.short || "");
    return ["FT", "AET", "PEN"].includes(st);
  } catch {
    return false;
  }
}

/* =======================================================================
   API-Football — estatísticas COMPARATIVAS DO TIME (`/fixtures/statistics`)
   -----------------------------------------------------------------------
   1 requisição por jogo devolve as 17 métricas dos dois times juntas:
   posse, xG, finalizações (total/no gol/para fora/bloqueadas/dentro/fora
   da área), passes, escanteios, faltas, impedimentos, cartões, defesas do
   goleiro, cobranças de falta.

   NÃO existe split por tempo no plano Free: `?half=true` devolve os mesmos
   números do agregado (verificado em novembro/2026), por isso a UI mostra
   os toggles de 1º/2º tempo travados.

   Os valores chegam como string e com sufixo % ("57%"). Normalizamos para
   número puro e preservamos o percentual em campo separado.
   ======================================================================= */

/** Uma métrica comparativa já normalizada. */
export type TeamStatMetric = {
  /** Chave estável e legível (ex.: "ball_possession"). */
  key: string;
  /** Rótulo em pt-BR para a UI. */
  label: string;
  /** Valor do mandante (numérico, sem %). */
  home: number;
  /** Valor do visitante (numérico, sem %). */
  away: number;
  /** true quando o valor é percentual (posse, passes certos). */
  percent?: boolean;
};

/** Converte "57%" → 57, "1.43" → 1.43, "449" → 449. Nulo → 0. */
function parseStatValue(v: any): { n: number; pct: boolean } {
  if (v == null) return { n: 0, pct: false };
  const s = String(v).trim();
  const pct = s.includes("%");
  const n = Number(s.replace("%", "").replace(",", "."));
  return { n: Number.isFinite(n) ? n : 0, pct };
}

/** Métricas da API → rótulo pt-BR. Ordem define o ranking de "Principais". */
const AF_TEAM_METRICS: { type: string; key: string; label: string }[] = [
  { type: "Ball Possession", key: "ball_possession", label: "Posse de bola" },
  { type: "expected_goals", key: "expected_goals", label: "xG (gols esperados)" },
  { type: "Total Shots", key: "total_shots", label: "Finalizações" },
  { type: "Shots on Goal", key: "shots_on_goal", label: "Finalizações no gol" },
  { type: "Shots off Goal", key: "shots_off_goal", label: "Finalizações para fora" },
  { type: "Blocked Shots", key: "blocked_shots", label: "Finalizações bloqueadas" },
  { type: "Shots insidebox", key: "shots_insidebox", label: "Finalizações na área" },
  { type: "Shots outsidebox", key: "shots_outsidebox", label: "Finalizações fora da área" },
  { type: "Total passes", key: "total_passes", label: "Passes" },
  { type: "Passes accurate", key: "passes_accurate", label: "Passes certos" },
  { type: "Corner Kicks", key: "corner_kicks", label: "Escanteios" },
  { type: "Fouls", key: "fouls", label: "Faltas" },
  { type: "Offsides", key: "offsides", label: "Impedimentos" },
  { type: "Yellow Cards", key: "yellow_cards", label: "Cartões amarelos" },
  { type: "Red Cards", key: "red_cards", label: "Cartões vermelhos" },
  { type: "Goalkeeper Saves", key: "goalkeeper_saves", label: "Defesas do goleiro" },
  { type: "Free Kicks", key: "free_kicks", label: "Cobranças de falta" },
];

/**
 * Busca `/fixtures/statistics` e devolve as métricas comparativas Home×Away.
 * Retorna [] quando a partida não tem estatística publicada (ex.: não começou).
 * `fixtureId` pode ser omitido: nesse caso o id é resolvido por nome+data.
 */
export async function afTeamStats(
  fixtureId: string | number
): Promise<{ metrics: TeamStatMetric[]; homeTeamId: string; awayTeamId: string }> {
  const fxId = encodeURIComponent(String(fixtureId));
  const d = await afFetch(`/fixtures/statistics?fixture=${fxId}`, 24 * 60 * 60 * 1000);
  const boxes: any[] = d?.response || [];
  if (boxes.length < 2) return { metrics: [], homeTeamId: "", awayTeamId: "" };

  /* Descobre o mando para não trocar os lados. */
  let homeId = "";
  let awayId = "";
  try {
    const fx = await afFetch(`/fixtures?id=${fxId}`, 24 * 60 * 60 * 1000);
    const f = (fx?.response || [])[0];
    homeId = String(f?.teams?.home?.id ?? "");
    awayId = String(f?.teams?.away?.id ?? "");
  } catch {
    /* sem mando: usa a ordem devolvida */
  }

  const boxHome = boxes.find((b) => String(b?.team?.id) === homeId) || boxes[0];
  const boxAway = boxes.find((b) => String(b?.team?.id) === awayId) || boxes[1];

  const mapa = (box: any) => {
    const m = new Map<string, { n: number; pct: boolean }>();
    for (const s of box?.statistics || []) {
      if (!s?.type) continue;
      m.set(String(s.type), parseStatValue(s.value));
    }
    return m;
  };
  const h = mapa(boxHome);
  const a = mapa(boxAway);

  const metrics: TeamStatMetric[] = [];
  for (const def of AF_TEAM_METRICS) {
    const hv = h.get(def.type);
    const av = a.get(def.type);
    if (!hv && !av) continue; /* a fonte não publicou esta métrica */
    metrics.push({
      key: def.key,
      label: def.label,
      home: hv?.n ?? 0,
      away: av?.n ?? 0,
      percent: !!(hv?.pct || av?.pct),
    });
  }

  return {
    metrics,
    homeTeamId: String(boxHome?.team?.id ?? ""),
    awayTeamId: String(boxAway?.team?.id ?? ""),
  };
}
