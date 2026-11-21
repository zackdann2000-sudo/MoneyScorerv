/**
 * Motor de probabilidade do módulo Hub.
 *
 * Cadeia: força de ataque/defesa por time -> gols esperados por lado (Poisson
 * com correção de Dixon-Coles nos placares baixos) -> matriz de placares ->
 * mercados (1X2, Over/Under, BTTS, dupla chance) -> valor esperado contra as
 * odds reais -> oportunidade.
 *
 * O ajuste de escalação é a parte que o mercado não faz: em vez de média do
 * time, olhamos quem realmente entra. Cada jogador tem participação em gol
 * (gols + assistências por 90) e minutos; a produção do XI é comparada com a
 * produção do elenco inteiro, e o xG do lado é multiplicado por essa fração.
 * Jogador importante no banco conta como ausência parcial.
 */

export type MatchSample = {
  date: string;
  opponent: string;
  location: "Home" | "Away";
  goalsFor: number;
  goalsAgainst: number;
  xgFor?: number | null;
  xgAgainst?: number | null;
  goalMinutes?: number[];
};

export type SquadPlayer = {
  playerId: number;
  name: string;
  role: "xi" | "bench" | "sidelined";
  position?: string | null;
  goals: number;
  assists: number;
  minutes: number;
  /** Posição na ordem de produção do elenco (1 = mais decisivo). */
  rank?: number;
};

export type TeamInput = {
  teamId: number;
  teamName: string;
  matches: MatchSample[];
  /** Média de gols por time por jogo na liga (ex.: 1.42). */
  leagueGoalAvg: number;
  /** Média de gols do mandante na liga; se ausente usa leagueGoalAvg. */
  leagueHomeGoalAvg?: number;
  tablePosition?: number | null;
  squad: SquadPlayer[];
  /** Ids do time nos quais o jogador está lesionado/suspenso (fora do XI). */
  unavailable?: { name: string; goals: number; assists: number; reason?: string }[];
};

export type Factor = {
  side: "Home" | "Away";
  factorType: string;
  impact: number;
  weight: number;
  context: Record<string, unknown>;
};

export type Prediction = { market: string; selection: string; probability: number };
export type TopScore = { home: number; away: number; probability: number };

export type Summary = {
  kind: "favourite" | "balanced" | "low_goals";
  favouriteSide: "Home" | "Away" | "None";
  favouriteStrength: "slight" | "clear" | "strong" | "none";
  topProbability: number;
  xgHome: number;
  xgAway: number;
  expectedTotalGoals: number;
  over25Probability: number;
  bttsProbability: number;
};

export type LabInsight = {
  patternType: string;
  rank: number;
  solidityScore: number;
  teamName: string;
  text: string;
};

export type ModelOutput = {
  xgHome: number;
  xgAway: number;
  predictions: Prediction[];
  topScores: TopScore[];
  summary: Summary;
  factors: Factor[];
  confidence: number;
  labInsights: LabInsight[];
  keyFactors: string[];
  riskFactors: string[];
  sampleSize: { home: number; away: number };
};

export type OddsRow = { bookmaker: string; bookmakerSlug: string; odds: number; isPick: boolean };
export type OddsIndex = Record<string, OddsRow[] | undefined>;

export type ValueCandidate = {
  market: string;
  selection: string;
  probability: number;
  odds: number;
  value: number;
  maxPlayableOdds: number;
  isHotPick: boolean;
  isSubstitution: boolean;
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round = (v: number, digits = 4) => Number(v.toFixed(digits));
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Força de ataque/defesa com encolhimento para amostra pequena. */
function strength(observed: number, leagueAvg: number, sampleSize: number): number {
  // k = 6 jogos: com 6 jogos metade do peso vai para a média da liga.
  const k = 6;
  const w = sampleSize / (sampleSize + k);
  const raw = leagueAvg > 0 ? observed / leagueAvg : 1;
  return clamp(1 + (raw - 1) * w, 0.45, 2.6);
}

function productionPer90(p: SquadPlayer): number {
  const mins = Math.max(90, p.minutes);
  return ((p.goals + 0.7 * p.assists) / mins) * 90;
}

/**
 * Fração de produção ofensiva disponível no XI.
 *
 * 1.0 = elenco completo em campo. 0.7 = um terço da produção do time fora.
 * Jogador no banco conta 40% (pode entrar), desfalque conta 0%.
 */
export function lineupFactor(squad: SquadPlayer[], side: "Home" | "Away"): { factor: number; context: Record<string, unknown> } {
  void side;
  if (!squad.length) return { factor: 1, context: { available: false } };
  const total = squad.reduce((s, p) => s + productionPer90(p), 0);
  if (total <= 0) return { factor: 1, context: { available: true, empty: true } };
  let available = 0;
  for (const p of squad) {
    const prod = productionPer90(p);
    if (p.role === "xi") available += prod;
    else if (p.role === "bench") available += prod * 0.4;
  }
  const share = available / total;
  // Piso de 0.62: nem o pior cenário de escalação derruba o time a menos de
  // ~2/3 da produção; acima disso a correção é proporcional.
  const factor = clamp(0.62 + 0.38 * share, 0.62, 1.03);
  return { factor, context: { availableShare: round(share, 4), factor: round(factor, 4) } };
}

/** Correção de Dixon-Coles (rho negativo) para placares baixos. */
function dixonColes(h: number, a: number, lh: number, la: number, rho: number): number {
  if (h === 0 && a === 0) return 1 - lh * la * rho;
  if (h === 0 && a === 1) return 1 + lh * rho;
  if (h === 1 && a === 0) return 1 + la * rho;
  if (h === 1 && a === 1) return 1 - rho;
  return 1;
}

function factorial(n: number): number {
  let out = 1;
  for (let i = 2; i <= n; i += 1) out *= i;
  return out;
}

function poisson(k: number, lambda: number): number {
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

export const MAX_GOALS = 8;

/** Matriz de placares (probabilidade conjunta), já normalizada. */
export function scoreMatrix(xgHome: number, xgAway: number, rho = -0.11): number[][] {
  const matrix: number[][] = [];
  let total = 0;
  for (let h = 0; h <= MAX_GOALS; h += 1) {
    matrix[h] = [];
    for (let a = 0; a <= MAX_GOALS; a += 1) {
      const p = poisson(h, xgHome) * poisson(a, xgAway) * dixonColes(h, a, xgHome, xgAway, rho);
      matrix[h][a] = p;
      total += p;
    }
  }
  for (let h = 0; h <= MAX_GOALS; h += 1) {
    for (let a = 0; a <= MAX_GOALS; a += 1) matrix[h][a] /= total;
  }
  return matrix;
}

export function marketsFromMatrix(matrix: number[][]): Prediction[] {
  let home = 0;
  let draw = 0;
  let away = 0;
  let bttsYes = 0;
  const totals = new Map<string, number>();
  const lines = [1.5, 2.5, 3.5];

  for (let h = 0; h <= MAX_GOALS; h += 1) {
    for (let a = 0; a <= MAX_GOALS; a += 1) {
      const p = matrix[h][a];
      if (h > a) home += p;
      else if (h === a) draw += p;
      else away += p;
      if (h > 0 && a > 0) bttsYes += p;
      for (const line of lines) {
        if (h + a > line) totals.set(`Over ${line}`, (totals.get(`Over ${line}`) ?? 0) + p);
        else totals.set(`Under ${line}`, (totals.get(`Under ${line}`) ?? 0) + p);
      }
    }
  }

  const out: Prediction[] = [
    { market: "1X2", selection: "Home", probability: round(home) },
    { market: "1X2", selection: "Draw", probability: round(draw) },
    { market: "1X2", selection: "Away", probability: round(away) },
    { market: "BTTS", selection: "Yes", probability: round(bttsYes) },
    { market: "BTTS", selection: "No", probability: round(1 - bttsYes) },
  ];
  for (const line of lines) {
    out.push({ market: "Over/Under", selection: `Over ${line}`, probability: round(totals.get(`Over ${line}`) ?? 0) });
    out.push({ market: "Over/Under", selection: `Under ${line}`, probability: round(totals.get(`Under ${line}`) ?? 0) });
  }
  out.push({ market: "DoubleChance", selection: "HomeOrDraw", probability: round(home + draw) });
  out.push({ market: "DoubleChance", selection: "AwayOrDraw", probability: round(away + draw) });
  out.push({ market: "DoubleChance", selection: "HomeOrAway", probability: round(home + away) });
  return out;
}

export function topScoresFromMatrix(matrix: number[][], count = 5): TopScore[] {
  const all: TopScore[] = [];
  for (let h = 0; h <= MAX_GOALS; h += 1) {
    for (let a = 0; a <= MAX_GOALS; a += 1) all.push({ home: h, away: a, probability: round(matrix[h][a]) });
  }
  return all.sort((x, y) => y.probability - x.probability).slice(0, count);
}

function formString(matches: MatchSample[]): string {
  return matches
    .slice(-5)
    .map((m) => (m.goalsFor > m.goalsAgainst ? "W" : m.goalsFor === m.goalsAgainst ? "D" : "L"))
    .reverse()
    .join("");
}

/** Fatores de xG do lado — cada um com impacto em gols esperados e peso. */
export function buildFactors(team: TeamInput, opponent: TeamInput, side: "Home" | "Away", leagueAvgTotal: number): Factor[] {
  const factors: Factor[] = [];
  const sample = team.matches;
  const n = sample.length;
  const gf = avg(sample.map((m) => m.goalsFor));
  const ga = avg(sample.map((m) => m.goalsAgainst));
  const push = (factorType: string, impact: number, weight: number, context: Record<string, unknown>) =>
    factors.push({ side, factorType, impact: round(impact), weight: round(weight, 2), context });

  if (n >= 3) {
    const recent = avg(sample.slice(-5).map((m) => m.goalsFor));
    const season = gf;
    if (recent > season * 1.2) {
      push("StrongRecentForm", (recent - season) * 0.5, 0.75, { recentAvg: round(recent, 2), seasonAvg: round(season, 2) });
    } else if (recent < season * 0.8) {
      push("WeakRecentForm", (recent - season) * 0.5, 0.75, { recentAvg: round(recent, 2), seasonAvg: round(season, 2) });
    }

    const scoringStreak = sample.slice(-5).filter((m) => m.goalsFor >= 2).length;
    if (scoringStreak >= 3) push("HighScoringStreak", 0.08 * scoringStreak, 0.7, { streak: scoringStreak, recentAvg: round(recent, 2) });
    else if (sample.slice(-5).filter((m) => m.goalsFor <= 1).length >= 4) {
      push("LowScoringStreak", -0.12, 0.7, { streak: 5 - scoringStreak, recentAvg: round(recent, 2) });
    }

    const cleanSheets = sample.slice(-5).filter((m) => m.goalsAgainst === 0).length;
    if (cleanSheets >= 2) push("CleanSheetStreak", -0.05 * cleanSheets, 0.55, { streak: cleanSheets });

    if (ga < team.leagueGoalAvg * 0.8) push("StrongDefense", (team.leagueGoalAvg - ga) * 0.4, 0.8, { concededAvg: round(ga, 2), leagueAvg: round(team.leagueGoalAvg, 2) });
    else if (ga > team.leagueGoalAvg * 1.2) push("WeakDefense", (team.leagueGoalAvg - ga) * 0.4, 0.8, { concededAvg: round(ga, 2), leagueAvg: round(team.leagueGoalAvg, 2) });

    if (gf > team.leagueGoalAvg * 1.15) push("StrongAttackRating", (gf - team.leagueGoalAvg) * 0.35, 0.85, { rating: round(gf / Math.max(0.1, team.leagueGoalAvg), 2) });
    else if (gf < team.leagueGoalAvg * 0.85) push("WeakAttackRating", (gf - team.leagueGoalAvg) * 0.35, 0.85, { rating: round(gf / Math.max(0.1, team.leagueGoalAvg), 2) });

    if (n < 6) push("SmallSampleRegression", 0, 0.3, { gamesPlayed: n });
  }

  if (leagueAvgTotal >= 3.1) push("HighScoringLeague", 0.1, 0.5, { leagueAvgTotal: round(leagueAvgTotal, 2) });
  else if (leagueAvgTotal <= 2.2) push("LowScoringLeague", -0.1, 0.5, { leagueAvgTotal: round(leagueAvgTotal, 2) });

  const myPos = team.tablePosition ?? null;
  const oppPos = opponent.tablePosition ?? null;
  if (myPos && oppPos && myPos !== oppPos) {
    const gap = oppPos - myPos;
    if (gap >= 4) push("StandingsAdvantage", clamp(gap * 0.02, 0.02, 0.3), 0.73, { position: myPos, opponentPosition: oppPos, gap });
    else if (gap <= -4) push("StandingsDisadvantage", clamp(gap * 0.02, -0.3, -0.02), 0.73, { position: myPos, opponentPosition: oppPos, gap: Math.abs(gap) });
  }

  // Escalação: quem produz e não está em campo.
  const { factor: lineup, context: lineupCtx } = lineupFactor(team.squad, side);
  const totalProd = team.squad.reduce((s, p) => s + productionPer90(p), 0);
  const xiProd = team.squad.filter((p) => p.role === "xi").reduce((s, p) => s + productionPer90(p), 0);

  if (totalProd > 0 && team.squad.length) {
    const missingShare = clamp(1 - xiProd / totalProd, 0, 1);
    if (missingShare > 0.35) {
      push("SignificantSquadWeakening", -0.3 * missingShare, 0.9, {
        missingPct: Math.round(missingShare * 100),
        activeShare: Math.round((1 - missingShare) * 100),
      });
    } else if (missingShare <= 0.05) {
      push("FullStrengthSquad", 0.02, 0.6, { activeShare: Math.round((1 - missingShare) * 100) });
    }

    const keyOut = team.squad
      .filter((p) => p.role !== "xi" && productionPer90(p) > 0.25)
      .sort((a, b) => productionPer90(b) - productionPer90(a))[0];
    if (keyOut) {
      const factorType = keyOut.role === "bench" ? "MissingKeyPlayerBench" : "MissingKeyPlayerAbsent";
      push(factorType, -0.18 * clamp(productionPer90(keyOut), 0, 1.5), 0.9, {
        playerName: keyOut.name,
        goals: keyOut.goals,
        assists: keyOut.assists,
        status: keyOut.role === "bench" ? "bench" : "absent",
      });
    }
  }
  if (lineup < 0.95) push("LineupAdjustment", (lineup - 1) * 1.2, 0.95, lineupCtx);

  return factors;
}

/** Soma dos impactos como ajuste multiplicativo de xG (limite ±25%). */
export function factorShift(factors: Factor[], side: "Home" | "Away"): number {
  const weightSum = factors.filter((f) => f.side === side).reduce((s, f) => s + f.weight, 0);
  if (weightSum <= 0) return 1;
  const impact = factors.filter((f) => f.side === side).reduce((s, f) => s + f.impact * f.weight, 0);
  return clamp(1 + impact / Math.max(1, weightSum), 0.75, 1.25);
}

export function confidenceFor(nHome: number, nAway: number, xgHome: number, xgAway: number): number {
  const sampleScore = clamp(Math.min(nHome, nAway) / 10, 0, 1);
  const spread = Math.abs(xgHome - xgAway);
  const clarity = clamp(spread / 1.6, 0, 1);
  return Math.round(clamp(38 + sampleScore * 40 + clarity * 20, 35, 96));
}

/** Padrões recentes ("The Lab") sobre os últimos jogos disponíveis. */
export function buildLabInsights(team: TeamInput): LabInsight[] {
  const out: LabInsight[] = [];
  const recent = team.matches.slice(-12);
  if (recent.length < 5) return out;

  const wins = recent.filter((m) => m.goalsFor > m.goalsAgainst).length;
  const xgWins = recent.filter((m) => (m.xgFor ?? m.goalsFor) > 1).length;
  if (xgWins >= 6) {
    const rate = Math.round((wins / recent.length) * 100);
    out.push({
      patternType: "EfficiencyPattern",
      rank: out.length + 1,
      solidityScore: round(clamp(0.4 + recent.length / 40, 0, 0.95), 4),
      teamName: team.teamName,
      text: `${team.teamName} criou mais de 1.0 de xG em ${xgWins} dos últimos ${recent.length} jogos e converteu ${rate}% em vitórias.`,
    });
  }

  const minutes = recent.flatMap((m) => m.goalMinutes ?? []);
  if (minutes.length >= 8) {
    const buckets: Record<string, number> = { "1-15": 0, "16-30": 0, "31-45": 0, "46-60": 0, "61-75": 0, "76-90": 0 };
    for (const mn of minutes) {
      if (mn <= 15) buckets["1-15"] += 1;
      else if (mn <= 30) buckets["16-30"] += 1;
      else if (mn <= 45) buckets["31-45"] += 1;
      else if (mn <= 60) buckets["46-60"] += 1;
      else if (mn <= 75) buckets["61-75"] += 1;
      else buckets["76-90"] += 1;
    }
    const [bestBucket, bestCount] = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0];
    const share = bestCount / minutes.length;
    if (share >= 0.35) {
      out.push({
        patternType: "IntervalDominance",
        rank: out.length + 1,
        solidityScore: round(clamp(share, 0, 0.95), 4),
        teamName: team.teamName,
        text: `${team.teamName} marcou ${Math.round(share * 100)}% dos gols recentes no intervalo de ${bestBucket} minutos (${bestCount} de ${minutes.length}).`,
      });
    }
  }

  const firstGoalGames = recent.filter((m) => m.goalsFor > 0).length;
  if (firstGoalGames >= 7) {
    const share = firstGoalGames / recent.length;
    out.push({
      patternType: "FirstGoalPattern",
      rank: out.length + 1,
      solidityScore: round(clamp(share, 0, 0.95), 4),
      teamName: team.teamName,
      text: `${team.teamName} marcou pelo menos um gol em ${firstGoalGames} dos últimos ${recent.length} jogos (${Math.round(share * 100)}%).`,
    });
  }

  return out.sort((a, b) => b.solidityScore - a.solidityScore).slice(0, 5);
}

function keyFactorTexts(team: TeamInput, opponent: TeamInput): { key: string[]; risk: string[] } {
  const key: string[] = [];
  const risk: string[] = [];
  const form = formString(team.matches);
  if (form) key.push(`Forma de ${team.teamName}: ${form.split("").join(" ")} nos últimos jogos.`);
  const gf = avg(team.matches.map((m) => m.goalsFor));
  if (gf >= 1.6) key.push(`${team.teamName} marca ${gf.toFixed(2)} gol por jogo na amostra.`);
  const ga = avg(team.matches.map((m) => m.goalsAgainst));
  if (ga >= 1.5) risk.push(`${team.teamName} sofre ${ga.toFixed(2)} gol por jogo na amostra.`);
  if (team.tablePosition && opponent.tablePosition && team.tablePosition < opponent.tablePosition) {
    key.push(`${team.teamName} está ${Math.abs(opponent.tablePosition - team.tablePosition)} posições à frente na tabela.`);
  }
  const outKey = team.squad.filter((p) => p.role === "sidelined").map((p) => p.name);
  if (outKey.length) risk.push(`Desfalques confirmados: ${outKey.slice(0, 3).join(", ")}.`);
  return { key, risk };
}

export function runHubModel(home: TeamInput, away: TeamInput): ModelOutput {
  const leagueAvgTotal = (home.leagueGoalAvg + away.leagueGoalAvg) / 2;
  const lh = home.leagueHomeGoalAvg ?? home.leagueGoalAvg;
  const la = away.leagueGoalAvg;

  const attackHome = strength(avg(home.matches.map((m) => m.goalsFor)) || lh, home.leagueGoalAvg, home.matches.length);
  const attackAway = strength(avg(away.matches.map((m) => m.goalsFor)) || la, away.leagueGoalAvg, away.matches.length);
  const defHome = strength(avg(home.matches.map((m) => m.goalsAgainst)) || home.leagueGoalAvg, home.leagueGoalAvg, home.matches.length);
  const defAway = strength(avg(away.matches.map((m) => m.goalsAgainst)) || away.leagueGoalAvg, away.leagueGoalAvg, away.matches.length);

  const factors = [
    ...buildFactors(home, away, "Home", leagueAvgTotal),
    ...buildFactors(away, home, "Away", leagueAvgTotal),
  ];

  const xgHome = clamp(lh * attackHome * defAway * factorShift(factors, "Home"), 0.15, 5.5);
  const xgAway = clamp(la * attackAway * defHome * factorShift(factors, "Away"), 0.15, 5.5);

  const matrix = scoreMatrix(xgHome, xgAway);
  const predictions = marketsFromMatrix(matrix);
  const topScores = topScoresFromMatrix(matrix);

  const oneX2 = predictions.filter((p) => p.market === "1X2");
  const best = oneX2.reduce((a, b) => (b.probability > a.probability ? b : a), oneX2[0]);
  const over25 = predictions.find((p) => p.selection === "Over 2.5")?.probability ?? 0;
  const btts = predictions.find((p) => p.market === "BTTS" && p.selection === "Yes")?.probability ?? 0;

  const summary: Summary = {
    kind: over25 < 0.42 ? "low_goals" : best.probability > 0.52 ? "favourite" : "balanced",
    favouriteSide: best.selection === "Home" ? "Home" : best.selection === "Away" ? "Away" : "None",
    favouriteStrength: best.probability >= 0.68 ? "strong" : best.probability >= 0.58 ? "clear" : best.probability >= 0.48 ? "slight" : "none",
    topProbability: best.probability,
    xgHome: round(xgHome, 2),
    xgAway: round(xgAway, 2),
    expectedTotalGoals: round(xgHome + xgAway, 2),
    over25Probability: over25,
    bttsProbability: btts,
  };

  const insightPool = [...buildLabInsights(home), ...buildLabInsights(away)]
    .sort((a, b) => b.solidityScore - a.solidityScore)
    .slice(0, 5)
    .map((ins, i) => ({ ...ins, rank: i + 1 }));

  const homeKeys = keyFactorTexts(home, away);
  const awayKeys = keyFactorTexts(away, home);

  return {
    xgHome: round(xgHome, 3),
    xgAway: round(xgAway, 3),
    predictions,
    topScores,
    summary,
    factors,
    confidence: confidenceFor(home.matches.length, away.matches.length, xgHome, xgAway),
    labInsights: insightPool,
    keyFactors: [...homeKeys.key, ...awayKeys.key].slice(0, 5),
    riskFactors: [...homeKeys.risk, ...awayKeys.risk].slice(0, 4),
    sampleSize: { home: home.matches.length, away: away.matches.length },
  };
}

/**
 * Oportunidade: melhor valor esperado entre as seleções com odd disponível.
 *
 * Regras (as mesmas que o histórico público precisa respeitar):
 *  - odd de referência = a da casa "pick" (Pinnacle), com fallback para a
 *    melhor odd disponível;
 *  - `valor = p * odd - 1` precisa passar do limiar (padrão 3%);
 *  - `maxPlayableOdds = 1/p` é a odd de break-even: abaixo dela o EV é
 *    negativo e a oportunidade deixa de valer;
 *  - probabilidade mínima de 30% filtra zebra de valor alto e acerto baixo.
 */
export function pickOpportunity(
  predictions: Prediction[],
  odds: OddsIndex,
  opts: { minValue?: number; minProbability?: number; hotPickValue?: number } = {},
): ValueCandidate | null {
  const minValue = opts.minValue ?? 0.03;
  const minProbability = opts.minProbability ?? 0.3;
  const hotPickValue = opts.hotPickValue ?? 0.12;
  let bestCandidate: ValueCandidate | null = null;

  for (const p of predictions) {
    if (p.market === "DoubleChance") continue;
    if (p.probability < minProbability) continue;
    const key = `${p.market}|${p.selection}`;
    const rows = odds[key];
    if (!rows || !rows.length) continue;
    const reference = rows.find((r) => r.isPick) ?? rows.reduce((a, b) => (b.odds > a.odds ? b : a), rows[0]);
    if (!reference || !Number.isFinite(reference.odds) || reference.odds <= 1.01) continue;
    const value = p.probability * reference.odds - 1;
    if (value < minValue) continue;
    if (!bestCandidate || value > bestCandidate.value) {
      bestCandidate = {
        market: p.market,
        selection: p.selection,
        probability: p.probability,
        odds: reference.odds,
        value: round(value),
        maxPlayableOdds: round(1 / p.probability, 2),
        isHotPick: value >= hotPickValue && p.probability >= 0.5,
        isSubstitution: false,
      };
    }
  }

  return bestCandidate;
}
