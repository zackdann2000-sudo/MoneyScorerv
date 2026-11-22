import { marketsFromMatrix, scoreMatrix, topScoresFromMatrix, type TopScore } from "./model";

/**
 * MASSA DE DEMONSTRAÇÃO do Centro de Jogos.
 *
 * Serve para uma coisa só: a UI renderizar quando o banco está vazio ou
 * inacessível (ex.: ambiente sem sync rodado). Nada aqui simula fornecedor,
 * chamada HTTP ou odd "real" — são xG fixos de futebol plausível, e todas as
 * probabilidades/placares saem do MESMO motor Poisson que roda em produção
 * (`scoreMatrix` / `marketsFromMatrix` / `topScoresFromMatrix`).
 *
 * A tela marca esses jogos com a faixa "modo demonstração" e o link de detalhe
 * usa ids negativos, que nunca colidem com ids reais do banco.
 */

export type DemoTeam = { id: number; name: string; logoUrl: string | null; tablePosition: number | null };
export type DemoGame = {
  id: number;
  kickoffOffsetMin: number;
  league: { id: number; name: string; country: string | null; isExperimental: boolean };
  roundName: string | null;
  venue: string | null;
  home: DemoTeam;
  away: DemoTeam;
  xg: { home: number; away: number };
  /** Odd de referência (Pinnacle) por seleção 1X2. `null` = jogo sem mercado. */
  odds: { home: number; draw: number; away: number } | null;
  liveState: string;
  homeScore: number;
  awayScore: number;
};

const t = (id: number, name: string, tablePosition: number | null = null): DemoTeam => ({
  id,
  name,
  logoUrl: null,
  tablePosition,
});

export const DEMO_GAMES: DemoGame[] = [
  {
    id: -101,
    kickoffOffsetMin: 95,
    league: { id: -1, name: "Premier League", country: "England", isExperimental: false },
    roundName: "Rodada 12",
    venue: "Emirates Stadium",
    home: t(-11, "Arsenal", 2),
    away: t(-12, "Brentford", 11),
    xg: { home: 2.05, away: 0.82 },
    odds: { home: 1.42, draw: 4.8, away: 7.6 },
    liveState: "NS",
    homeScore: 0,
    awayScore: 0,
  },
  {
    id: -102,
    kickoffOffsetMin: 160,
    league: { id: -1, name: "Premier League", country: "England", isExperimental: false },
    roundName: "Rodada 12",
    venue: "Vitality Stadium",
    home: t(-13, "Bournemouth", 8),
    away: t(-14, "Chelsea", 5),
    xg: { home: 1.18, away: 1.44 },
    odds: null,
    liveState: "NS",
    homeScore: 0,
    awayScore: 0,
  },
  {
    id: -103,
    kickoffOffsetMin: 45,
    league: { id: -2, name: "LaLiga", country: "Spain", isExperimental: false },
    roundName: "Jornada 14",
    venue: "Reale Arena",
    home: t(-21, "Real Sociedad", 7),
    away: t(-22, "Athletic Club", 4),
    xg: { home: 1.09, away: 1.16 },
    odds: { home: 2.62, draw: 3.15, away: 2.85 },
    liveState: "INPLAY_2ND_HALF",
    homeScore: 1,
    awayScore: 1,
  },
  {
    id: -104,
    kickoffOffsetMin: 210,
    league: { id: -2, name: "LaLiga", country: "Spain", isExperimental: false },
    roundName: "Jornada 14",
    venue: "RCDE Stadium",
    home: t(-23, "Espanyol", 15),
    away: t(-24, "Real Madrid", 1),
    xg: { home: 0.74, away: 1.93 },
    odds: { home: 6.4, draw: 4.2, away: 1.5 },
    liveState: "NS",
    homeScore: 0,
    awayScore: 0,
  },
  {
    id: -105,
    kickoffOffsetMin: 130,
    league: { id: -3, name: "Brasileirão Série A", country: "Brazil", isExperimental: false },
    roundName: "Rodada 35",
    venue: "Neo Química Arena",
    home: t(-31, "Corinthians", 9),
    away: t(-32, "Palmeiras", 2),
    xg: { home: 1.12, away: 1.28 },
    odds: null,
    liveState: "NS",
    homeScore: 0,
    awayScore: 0,
  },
  {
    id: -106,
    kickoffOffsetMin: 320,
    league: { id: -3, name: "Brasileirão Série A", country: "Brazil", isExperimental: false },
    roundName: "Rodada 35",
    venue: "Maracanã",
    home: t(-33, "Flamengo", 1),
    away: t(-34, "Cruzeiro", 3),
    xg: { home: 1.86, away: 1.02 },
    odds: { home: 1.85, draw: 3.5, away: 4.35 },
    liveState: "NS",
    homeScore: 0,
    awayScore: 0,
  },
  {
    id: -107,
    kickoffOffsetMin: 400,
    league: { id: -4, name: "Liga Portugal", country: "Portugal", isExperimental: true },
    roundName: "Jornada 11",
    venue: "Estádio Municipal de Braga",
    home: t(-41, "Braga", 4),
    away: t(-42, "Vitória SC", 6),
    xg: { home: 1.55, away: 1.1 },
    odds: null,
    liveState: "NS",
    homeScore: 0,
    awayScore: 0,
  },
  {
    id: -108,
    kickoffOffsetMin: -25,
    league: { id: -5, name: "Serie A", country: "Italy", isExperimental: false },
    roundName: "Giornata 13",
    venue: "Stadio Olimpico",
    home: t(-51, "Lazio", 6),
    away: t(-52, "Atalanta", 8),
    xg: { home: 1.34, away: 1.47 },
    odds: { home: 2.45, draw: 3.3, away: 2.95 },
    liveState: "INPLAY_1ST_HALF",
    homeScore: 0,
    awayScore: 1,
  },
];

/** Probabilidades 1X2 + placares mais prováveis de um jogo de demonstração. */
export function demoProbabilities(xg: { home: number; away: number }) {
  const matrix = scoreMatrix(xg.home, xg.away);
  const markets = marketsFromMatrix(matrix);
  const pick = (selection: string) => markets.find((m) => m.market === "1X2" && m.selection === selection)?.probability ?? 0;
  return {
    home: pick("Home"),
    draw: pick("Draw"),
    away: pick("Away"),
    btts: markets.find((m) => m.market === "BTTS" && m.selection === "Yes")?.probability ?? 0,
    over25: markets.find((m) => m.market === "Over/Under" && m.selection === "Over 2.5")?.probability ?? 0,
    markets,
    topScores: topScoresFromMatrix(matrix) as TopScore[],
  };
}

/** Valor esperado da melhor perna 1X2 contra a odd de referência. */
export function demoValue(game: DemoGame): { selection: "Home" | "Draw" | "Away"; probability: number; odds: number; value: number } | null {
  if (!game.odds) return null;
  const p = demoProbabilities(game.xg);
  const legs: Array<{ selection: "Home" | "Draw" | "Away"; probability: number; odds: number }> = [
    { selection: "Home", probability: p.home, odds: game.odds.home },
    { selection: "Draw", probability: p.draw, odds: game.odds.draw },
    { selection: "Away", probability: p.away, odds: game.odds.away },
  ];
  let best: { selection: "Home" | "Draw" | "Away"; probability: number; odds: number; value: number } | null = null;
  for (const leg of legs) {
    const value = leg.probability * leg.odds - 1;
    if (!best || value > best.value) best = { ...leg, value };
  }
  return best && best.value > 0.03 ? best : null;
}
