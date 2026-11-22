import { cached } from "@/lib/cache";
import { bzFetchV2 } from "@/lib/providers";
import { teamSimilarity } from "./identity";
import type { ContextPayload, LineupPayload, LineupPlayerInput, OddsWrite } from "./types";

/**
 * Adaptador Bzzoiro v2 para o Hub.
 *
 * Endpoints usados (confirmados na doc oficial + testados com a chave do
 * projeto): `/events/`, `/events/{id}/odds/`, `/events/{id}/lineups/`,
 * `/events/{id}/h2h/`, `/events/{id}/stats/`.
 *
 * O Bzzoiro é fornecedor SECUNDÁRIO: entra depois da Sportmonks nas odds e nas
 * escalações, e antes da ESPN em estatística/H2H. Nenhuma função aqui estima
 * preço ou escalação — se o payload vier sem `odds`/`lineups`, devolve vazio.
 */

type BzEvent = {
  id: number;
  league_id: number | null;
  home_team_id: number | null;
  away_team_id: number | null;
  home_team: string;
  away_team: string;
  event_date: string;
  status: string;
  current_minute?: number | null;
  home_score?: number | null;
  away_score?: number | null;
  round_label?: string | null;
  round_name?: string | null;
  stage_name?: string | null;
};

const BOOKMAKER = "Consenso (Bzzoiro)";
const BOOKMAKER_SLUG = "bzzoiro-consenso";

export function bzLiveState(status: string, minute?: number | null): string {
  const s = String(status || "").toLowerCase();
  if (["postponed", "cancelled", "canceled", "abandoned", "suspended"].includes(s)) return "POSTPONED";
  if (["finished", "ft", "ended"].includes(s)) return "FT";
  if (["halftime", "ht", "half-time"].includes(s)) return "HT";
  if (["live", "inplay", "in_progress", "playing"].includes(s)) {
    return minute != null && minute > 45 ? "INPLAY_2ND_HALF" : "INPLAY_1ST_HALF";
  }
  return "NS";
}

/** Jogos do dia no Bzzoiro (paginado até 200, cache curto). */
export async function bzEventsForDate(dateIso: string): Promise<BzEvent[]> {
  return cached(`hub:bz:events:${dateIso}`, 60_000, async () => {
    const primeiro = await bzFetchV2(`/events/?date_from=${dateIso}&date_to=${dateIso}&limit=200`, 60_000);
    const rows: BzEvent[] = Array.isArray(primeiro?.results) ? primeiro.results : [];
    const total = Number(primeiro?.count ?? rows.length);
    if (total > rows.length) {
      const segundo = await bzFetchV2(
        `/events/?date_from=${dateIso}&date_to=${dateIso}&limit=200&offset=200`,
        60_000,
      );
      if (Array.isArray(segundo?.results)) rows.push(...segundo.results);
    }
    return rows;
  });
}

/**
 * Acha o evento do Bzzoiro correspondente à nossa fixture.
 *
 * Casa por nome dos dois times (tolerante a acento/abreviação) e por kickoff
 * próximo. Se a similaridade não passar do corte, devolve null: melhor ficar
 * sem odds do que colar odd de outro jogo.
 */
export async function bzFindEventId(input: {
  kickoff: Date;
  homeName: string;
  awayName: string;
}): Promise<string | null> {
  const dias = [-1, 0, 1].map((d) => {
    const x = new Date(input.kickoff);
    x.setUTCDate(x.getUTCDate() + d);
    return x.toISOString().slice(0, 10);
  });

  let melhor: { id: string; score: number; dist: number } | null = null;
  for (const dia of dias) {
    let eventos: BzEvent[] = [];
    try {
      eventos = await bzEventsForDate(dia);
    } catch {
      continue;
    }
    for (const e of eventos) {
      const dist = Math.abs(new Date(e.event_date).getTime() - input.kickoff.getTime());
      if (dist > 6 * 3600_000) continue;
      const score = Math.min(teamSimilarity(e.home_team, input.homeName), teamSimilarity(e.away_team, input.awayName));
      if (score < 0.75) continue;
      if (!melhor || score > melhor.score || (score === melhor.score && dist < melhor.dist)) {
        melhor = { id: String(e.id), score, dist };
      }
    }
  }
  return melhor?.id ?? null;
}

type BzOdds = {
  home_win?: number | null;
  draw?: number | null;
  away_win?: number | null;
  over_15_goals?: number | null;
  under_15_goals?: number | null;
  over_25_goals?: number | null;
  under_25_goals?: number | null;
  over_35_goals?: number | null;
  under_35_goals?: number | null;
  btts_yes?: number | null;
  btts_no?: number | null;
};

/** Odds consensuais do Bzzoiro já no vocabulário do banco. */
export async function bzOddsForEvent(eventId: string): Promise<OddsWrite[]> {
  const d = await bzFetchV2(`/events/${eventId}/odds/`, 60_000);
  const o: BzOdds | undefined = d?.odds;
  if (!o) return [];

  const rows: OddsWrite[] = [];
  const push = (market: string, selection: string, odds: number | null | undefined) => {
    if (odds == null || !Number.isFinite(Number(odds))) return;
    const v = Number(odds);
    if (v <= 1) return;
    rows.push({ market, selection, odds: v, bookmaker: BOOKMAKER, bookmakerSlug: BOOKMAKER_SLUG });
  };

  push("1X2", "Home", o.home_win);
  push("1X2", "Draw", o.draw);
  push("1X2", "Away", o.away_win);
  push("BTTS", "Yes", o.btts_yes);
  push("BTTS", "No", o.btts_no);
  push("Over/Under", "Over 1.5", o.over_15_goals);
  push("Over/Under", "Under 1.5", o.under_15_goals);
  push("Over/Under", "Over 2.5", o.over_25_goals);
  push("Over/Under", "Under 2.5", o.under_25_goals);
  push("Over/Under", "Over 3.5", o.over_35_goals);
  push("Over/Under", "Under 3.5", o.under_35_goals);
  return rows;
}

type BzLineupSide = {
  team_id?: number | null;
  team_name?: string | null;
  formation?: string | null;
  confidence?: number | null;
  players?: Array<{
    id?: number | null;
    name?: string | null;
    short_name?: string | null;
    position?: string | null;
    jersey_number?: number | null;
    captain?: boolean | null;
    ai_score?: number | null;
  }> | null;
  substitutes?: Array<{
    id?: number | null;
    name?: string | null;
    short_name?: string | null;
    position?: string | null;
    jersey_number?: number | null;
  }> | null;
};

/**
 * Escalação do Bzzoiro.
 *
 * `lineup_status` decide o que é confirmação:
 *  - "confirmed" -> XI real, `confirmed: true` (destrava análise Final);
 *  - "predicted" -> XI estimado pelo modelo do Bzzoiro: gravamos, mas SEMPRE
 *    com `confirmed: false`, porque análise Final com palpite de escalação
 *    seria vender como certo o que é estimativa.
 */
export async function bzLineupsForEvent(eventId: string): Promise<LineupPayload | null> {
  const d = await bzFetchV2(`/events/${eventId}/lineups/`, 60_000);
  const status = String(d?.lineup_status || "none");
  const home: BzLineupSide | undefined = d?.lineups?.home;
  const away: BzLineupSide | undefined = d?.lineups?.away;
  if (!home?.players?.length || !away?.players?.length) return null;

  const map = (side: BzLineupSide): LineupPlayerInput[] => {
    const out: LineupPlayerInput[] = [];
    for (const p of side.players ?? []) {
      const nome = String(p.name || p.short_name || "").trim();
      if (!nome) continue;
      out.push({
        externalId: p.id != null ? String(p.id) : nome,
        name: nome,
        role: "xi",
        position: p.position ?? null,
        shirtNumber: p.jersey_number ?? null,
        isCaptain: Boolean(p.captain),
      });
    }
    for (const p of side.substitutes ?? []) {
      const nome = String(p.name || p.short_name || "").trim();
      if (!nome) continue;
      out.push({
        externalId: p.id != null ? String(p.id) : nome,
        name: nome,
        role: "bench",
        position: p.position ?? null,
        shirtNumber: p.jersey_number ?? null,
      });
    }
    return out;
  };

  const homeXi = (home.players ?? []).length;
  const awayXi = (away.players ?? []).length;
  return {
    confirmed: status === "confirmed" && homeXi >= 11 && awayXi >= 11,
    home: { formation: home.formation ?? null, players: map(home) },
    away: { formation: away.formation ?? null, players: map(away) },
  };
}

/** Chaves de estatística que o motor/UI usa; o resto é descartado. */
const STAT_KEYS = [
  "possession",
  "total_shots",
  "shots_on_target",
  "expected_goals",
  "corner_kicks",
  "fouls",
  "offsides",
  "yellow_cards",
  "red_cards",
  "total_saves",
];

export async function bzStatsForEvent(eventId: string): Promise<ContextPayload["stats"]> {
  const d = await bzFetchV2(`/events/${eventId}/stats/`, 60_000);
  const home = d?.stats?.home;
  const away = d?.stats?.away;
  if (!home || !away) return null;

  const num = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const out: NonNullable<ContextPayload["stats"]> = {};
  for (const k of STAT_KEYS) {
    const h = num(home[k]);
    const a = num(away[k]);
    if (h == null && a == null) continue;
    out[k] = { home: h, away: a };
  }
  return Object.keys(out).length ? out : null;
}

type BzH2H = {
  total_matches?: number;
  home_wins?: number;
  draws?: number;
  away_wins?: number;
  avg_total_goals?: number | null;
  recent_matches?: Array<{
    date?: string | null;
    home?: string;
    away?: string;
    home_score?: number | null;
    away_score?: number | null;
  }>;
};

export async function bzH2HForEvent(eventId: string): Promise<ContextPayload["h2h"]> {
  const d = await bzFetchV2(`/events/${eventId}/h2h/`, 300_000);
  const h: BzH2H = d || {};
  if (!h.total_matches) return null;
  return {
    matches: Number(h.total_matches),
    homeWins: Number(h.home_wins ?? 0),
    draws: Number(h.draws ?? 0),
    awayWins: Number(h.away_wins ?? 0),
    avgTotalGoals: h.avg_total_goals != null ? Number(h.avg_total_goals) : null,
    recent: (h.recent_matches ?? []).slice(0, 6).map((m) => ({
      date: m.date ?? null,
      home: String(m.home ?? ""),
      away: String(m.away ?? ""),
      homeScore: m.home_score ?? null,
      awayScore: m.away_score ?? null,
    })),
  };
}
