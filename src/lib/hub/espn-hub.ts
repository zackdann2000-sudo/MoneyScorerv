import { LEAGUES, getAllMatches, getSummaryRaw, leagueInfo, normH2H, normLineups, normOdds, normStats, ymd, type Match } from "@/lib/espn";
import { slugify, teamSimilarity } from "./identity";
import type { ContextPayload, LineupPayload, LineupPlayerInput, OddsWrite, RawFixture } from "./types";

/**
 * Adaptador ESPN para o Hub.
 *
 * A ESPN é a fonte PRIMÁRIA de jogos: gratuita, sem chave e cobre as ligas que
 * o Centro de Jogos lista. Ela também serve de último recurso para odds (o
 * DraftKings aparece no scoreboard/summary) e para estatística e H2H.
 *
 * Nada aqui inventa dado: quando o payload da ESPN não traz odds, o retorno é
 * lista vazia; quando não traz escalação oficial, `confirmed` fica false.
 */

const marcadorCopa = (nome: string) =>
  /champions|libertadores|sudamericana|europa|conference|nations|cup|copa|world/i.test(nome);

const marcadorInternacional = (nome: string) => /world|nations|qualif/i.test(nome);

/** Estado do jogo da ESPN -> vocabulário do banco. */
export function espnLiveState(m: Match): string {
  const etiqueta = `${m.status || ""}`.toUpperCase();
  if (/POSTPONED|CANCELED|CANCELLED|SUSPENDED|ABANDONED|DELAYED/.test(etiqueta)) return "POSTPONED";
  if (m.state === "post") return "FT";
  if (m.state === "in") {
    if (/HALFTIME|HALF.?TIME|\bHT\b/.test(etiqueta)) return "HT";
    if (m.period >= 3) return "INPLAY_ET";
    if (m.period === 2) return "INPLAY_2ND_HALF";
    return "INPLAY_1ST_HALF";
  }
  return "NS";
}

/**
 * Jogos de uma data (UTC) nas ligas rastreadas.
 *
 * `getAllMatches` limita a concorrência para não tomar 403 do Akamai da ESPN e
 * já mantém cache por 45s; aqui só traduzimos o formato.
 */
export async function espnFixturesForDate(dateIso: string): Promise<RawFixture[]> {
  const dia = ymd(new Date(`${dateIso}T12:00:00Z`));
  const matches = await getAllMatches(dia, LEAGUES.map((l) => l.code));
  const out: RawFixture[] = [];

  for (const m of matches) {
    if (!m.home?.id || !m.away?.id) continue;
    const info = leagueInfo(m.league);
    const liveState = espnLiveState(m);
    out.push({
      source: "espn",
      externalId: String(m.id),
      league: {
        externalId: m.league,
        name: info.name,
        countryName: info.country,
        isCup: marcadorCopa(info.name),
        seasonKey: m.date ? m.date.slice(0, 4) : null,
        seasonName: m.date ? m.date.slice(0, 4) : null,
      },
      home: { externalId: String(m.home.id), name: m.home.name, logo: m.home.logo || null },
      away: { externalId: String(m.away.id), name: m.away.name, logo: m.away.logo || null },
      kickoff: new Date(m.date),
      liveState,
      homeScore: m.home.score,
      awayScore: m.away.score,
      venueName: m.venue || null,
      roundName: null,
      isCup: marcadorCopa(info.name),
    });
  }
  return out;
}

export function competitionTypeFor(name: string, isCup: boolean): "Liga" | "Cup" | "International" {
  if (marcadorInternacional(name)) return "International";
  return isCup ? "Cup" : "Liga";
}

async function summary(leagueCode: string, eventId: string, state = "pre"): Promise<any> {
  try {
    return await getSummaryRaw(leagueCode, eventId, state);
  } catch {
    return null;
  }
}

/** Id do time mandante no payload da ESPN (host das estatísticas/escalação). */
function homeIdFromSummary(sm: any): string {
  const competitors: any[] = sm?.header?.competitions?.[0]?.competitors ?? [];
  const home = competitors.find((c) => c?.homeAway === "home");
  const id = home?.team?.id ?? home?.id;
  if (id != null) return String(id);
  const rosterHome = (sm?.rosters ?? []).find((r: any) => r?.homeAway === "home");
  if (rosterHome?.team?.id != null) return String(rosterHome.team.id);
  const primeiro = competitors[0]?.team?.id ?? sm?.rosters?.[0]?.team?.id;
  return primeiro != null ? String(primeiro) : "";
}

/**
 * Odds do jogo na ESPN (DraftKings no summary).
 *
 * Odds americanas são convertidas para decimal por `normOdds`. Sem pickcenter
 * com preços, devolve [] — nenhuma odd é estimada a partir de probabilidade.
 */
export async function espnOddsForFixture(leagueCode: string, eventId: string): Promise<OddsWrite[]> {
  const sm = await summary(leagueCode, eventId, "pre");
  if (!sm) return [];
  const o = normOdds(sm);
  if (!o) return [];
  const bookmaker = o.provider && o.provider !== "Mercado" ? `${o.provider} (ESPN)` : "ESPN";
  const bookmakerSlug = slugify(bookmaker) || "espn";
  const rows: OddsWrite[] = [];
  const push = (market: string, selection: string, odds: number | null | undefined) => {
    if (odds == null || !Number.isFinite(odds) || odds <= 1) return;
    rows.push({ market, selection, odds, bookmaker, bookmakerSlug });
  };
  push("1X2", "Home", o.home);
  push("1X2", "Draw", o.draw);
  push("1X2", "Away", o.away);

  const linha = o.ou != null ? ` ${o.ou}` : " 2.5";
  push("Over/Under", `Over${linha}`, o.over);
  push("Over/Under", `Under${linha}`, o.under);
  return rows;
}

/**
 * Escalação oficial da ESPN.
 *
 * `normLineups` só marca `official` quando os dois lados têm XI com posição de
 * formação; é esse booleano que destrava a análise Final.
 */
export async function espnLineupsForFixture(leagueCode: string, eventId: string): Promise<LineupPayload | null> {
  const sm = await summary(leagueCode, eventId, "pre");
  if (!sm) return null;
  const lu = normLineups(sm, homeIdFromSummary(sm));
  if (!lu?.home || !lu?.away) return null;
  if (!lu.home.xi.length && !lu.away.xi.length) return null;

  const map = (side: any): LineupPlayerInput[] => {
    const out: LineupPlayerInput[] = [];
    for (const p of side.xi) {
      out.push({
        externalId: String(p.name || p.short),
        name: String(p.name || p.short),
        role: "xi",
        position: p.pos || null,
        shirtNumber: p.jersey ? Number(p.jersey) || null : null,
        isCaptain: Boolean(p.captain),
        formationPosition: p.place || null,
      });
    }
    for (const p of side.bench) {
      out.push({
        externalId: String(p.name || p.short),
        name: String(p.name || p.short),
        role: "bench",
        position: p.pos || null,
        shirtNumber: p.jersey ? Number(p.jersey) || null : null,
      });
    }
    return out;
  };

  return {
    confirmed: Boolean(lu.official),
    home: { formation: lu.home.formation || null, players: map(lu.home) },
    away: { formation: lu.away.formation || null, players: map(lu.away) },
  };
}

/** Estatísticas da partida (posse, finalizações, escanteios...). Só pós-jogo. */
export async function espnStatsForFixture(leagueCode: string, eventId: string): Promise<ContextPayload["stats"]> {
  const sm = await summary(leagueCode, eventId, "post");
  if (!sm) return null;
  const rows = normStats(sm, homeIdFromSummary(sm));
  if (!rows.length) return null;
  const out: NonNullable<ContextPayload["stats"]> = {};
  for (const r of rows) out[r.label || r.key] = { home: r.home, away: r.away };
  return out;
}

/**
 * H2H da ESPN (`seasonseries`), orientado para o mandante da NOSSA fixture.
 *
 * A ESPN devolve a série como vier; os W/D/L são recalculados comparando os
 * nomes dos times com o mandante da partida atual.
 */
export async function espnH2HForFixture(
  leagueCode: string,
  eventId: string,
  homeName: string,
): Promise<ContextPayload["h2h"]> {
  const sm = await summary(leagueCode, eventId, "pre");
  if (!sm) return null;
  const h2h = normH2H(sm);
  const games: Array<{
    id: string;
    date?: string;
    league?: string;
    homeName: string;
    awayName: string;
    homeScore: number;
    awayScore: number;
  }> = h2h?.games ?? [];
  if (!games.length) return null;

  let homeWins = 0;
  let awayWins = 0;
  let draws = 0;
  let goals = 0;
  for (const g of games) {
    const gHomeIsOurs = teamSimilarity(g.homeName, homeName) >= teamSimilarity(g.awayName, homeName);
    const ours = gHomeIsOurs ? g.homeScore : g.awayScore;
    const theirs = gHomeIsOurs ? g.awayScore : g.homeScore;
    goals += g.homeScore + g.awayScore;
    if (ours > theirs) homeWins += 1;
    else if (ours < theirs) awayWins += 1;
    else draws += 1;
  }

  return {
    matches: games.length,
    homeWins,
    draws,
    awayWins,
    avgTotalGoals: goals / games.length,
    recent: games.slice(0, 6).map((g) => ({
      date: g.date ?? null,
      home: g.homeName,
      away: g.awayName,
      homeScore: g.homeScore,
      awayScore: g.awayScore,
    })),
  };
}
