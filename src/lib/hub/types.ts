import type { Provider } from "./identity";

/** Formato comum que todo adaptador de fornecedor entrega para a cascata. */

export type RawTeam = {
  externalId: string;
  name: string;
  logo?: string | null;
  countryIso2?: string | null;
};

export type RawLeague = {
  externalId: string;
  name: string;
  logo?: string | null;
  countryName?: string | null;
  countryIso2?: string | null;
  isCup?: boolean;
  seasonKey?: string | null;
  seasonName?: string | null;
};

export type RawFixture = {
  source: Provider;
  externalId: string;
  league: RawLeague;
  home: RawTeam;
  away: RawTeam;
  kickoff: Date;
  /** NS | INPLAY_1ST_HALF | HT | INPLAY_2ND_HALF | FT | AET | POSTPONED */
  liveState: string;
  homeScore: number | null;
  awayScore: number | null;
  homeRedCards?: number | null;
  awayRedCards?: number | null;
  minutesPlayed?: number | null;
  venueName?: string | null;
  venueCity?: string | null;
  stageName?: string | null;
  roundName?: string | null;
  isCup?: boolean;
  sportmonksId?: number | null;
};

/** Odd já no vocabulário do banco (mercado, seleção, casa). */
export type OddsWrite = {
  market: string;
  selection: string;
  odds: number;
  bookmaker: string;
  bookmakerSlug: string;
  isPick?: boolean;
  isKalshi?: boolean;
};

export type LineupPlayerInput = {
  externalId: string;
  name: string;
  role: "xi" | "bench" | "sidelined";
  position?: string | null;
  shirtNumber?: number | null;
  isCaptain?: boolean;
  formationPosition?: number | null;
  injuryType?: string | null;
};

export type LineupSide = { formation: string | null; players: LineupPlayerInput[] };

export type LineupPayload = {
  /** true só quando os dois lados têm XI completo publicado pelo fornecedor. */
  confirmed: boolean;
  home: LineupSide;
  away: LineupSide;
};

export type ContextPayload = {
  source: Provider;
  h2h: {
    matches: number;
    homeWins: number;
    draws: number;
    awayWins: number;
    avgTotalGoals: number | null;
    recent: Array<{ date: string | null; home: string; away: string; homeScore: number | null; awayScore: number | null }>;
  } | null;
  stats: Record<string, { home: number | string | null; away: number | string | null }> | null;
};
