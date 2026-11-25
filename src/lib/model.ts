import { JANELA_FORMA, JANELA_H2H, ajusteH2H, mediaPonderada, type AjusteH2H } from "./formaRecente";
import { getWeightedAverage, FORM_JANELA } from "./formWeight";

/**
 * Estrutura de um jogo do histórico que este motor consome.
 *
 * Fica declarada aqui (em vez de importar `HistGame` de `espn.ts`) de propósito:
 * o módulo é cálculo puro e não deve arrastar a camada de dados/banco junto.
 * `HistGame` do espn é um superconjunto disto, então continua atribuível.
 */
export type HistGame = {
  id: string;
  date: string;
  league: string;
  home: boolean;
  gf: number;
  ga: number;
  res: "V" | "E" | "D";
  xgEst: number | null;
  oppXgEst: number | null;
  xgF?: number | null;
  xgA?: number | null;
  xgFonte?: "api-football" | null;
  corners: number | null;
  oppCorners: number | null;
  yellow: number | null;
  red: number | null;
  oppYellow: number | null;
  fouls: number | null;
  oppFouls: number | null;
  sot: number | null;
  oppSot: number | null;
  shots: number | null;
  poss: number | null;
  htGf: number | null;
  htGa: number | null;
  offsides?: number | null;
};

/* ============================================================
   MODELO ESTATÍSTICO PREDITIVO — Poisson com ajuste Dixon-Coles
   Camada de cálculo pura: a IA de texto apenas narra estes números.
   ============================================================ */

export type TeamRates = {
  games: number; gfAvg: number; gaAvg: number; gfHome: number; gaHome: number; gfAway: number; gaAway: number;
  formPts: number; csRate: number; scoredRate: number; weightedGf: number; weightedGa: number;
  /** xG médio ponderado (ataque) e xG sofrido; null quando a fonte não trouxe. */
  xgF: number | null; xgA: number | null;
  /** Fração dos jogos da janela com xG disponível (0..1). */
  xgCoverage: number;
  /** Média de gols já mesclada com xG (50/50 quando há xG; senão só gols). */
  weightedGfXg: number; weightedGaXg: number;
  /** Origem do xG usado no blend (null quando não havia xG). */
  xgFonte: "api-football" | "espn" | null;
  /** Média de cartões por jogo (time + adversário) e escanteios por jogo. */
  cardsAvg: number | null; cornersAvg: number | null;
};

export function teamRates(games: HistGame[]): TeamRates {
  const n = games.length;
  if (!n) return { games: 0, gfAvg: 0, gaAvg: 0, gfHome: 0, gaHome: 0, gfAway: 0, gaAway: 0, formPts: 0, csRate: 0, scoredRate: 0, weightedGf: 0, weightedGa: 0, xgF: null, xgA: null, xgCoverage: 0, weightedGfXg: 0, weightedGaXg: 0, xgFonte: null, cardsAvg: null, cornersAvg: null };
  const sum = (f: (g: HistGame) => number, arr = games) => arr.reduce((s, g) => s + f(g), 0);
  const home = games.filter((g) => g.home), away = games.filter((g) => !g.home);
  // Peso da forma recente: 1.5 nos 3 últimos jogos, 1.0 do 4º ao 7º e 0.5 do
  // 8º ao 10º (janela de 10). Substitui a média chapada da temporada — é o que
  // faz uma sequência de vitórias elevar a chance de marcar. Ver lib/formWeight.
  const janela = games.slice(0, FORM_JANELA);
  const ponderadaGf = getWeightedAverage(janela.map((g) => g.gf));
  const ponderadaGa = getWeightedAverage(janela.map((g) => g.ga));
  // xG: média ponderada só sobre os jogos que tinham xG (nunca inventa número).
  const wAvgXg = (vals: (number | null)[]): number | null => {
    const v = vals.filter((x): x is number => x != null && Number.isFinite(x));
    return v.length ? getWeightedAverage(v) : null;
  };
  const xgOficial = janela.some((g) => g.xgF != null);
  const xgF = xgOficial ? wAvgXg(janela.map((g) => g.xgF ?? null)) : wAvgXg(janela.map((g) => g.xgEst ?? null));
  const xgA = xgOficial ? wAvgXg(janela.map((g) => g.xgA ?? null)) : wAvgXg(janela.map((g) => g.oppXgEst ?? null));
  const xgFonte: TeamRates["xgFonte"] = xgOficial ? "api-football" : xgF != null ? "espn" : null;
  const xgCoverage = janela.length
    ? janela.filter((g) => (xgOficial ? g.xgF != null : g.xgEst != null)).length / janela.length
    : 0;
  const gfBase = ponderadaGf ?? sum((g) => g.gf) / n;
  const gaBase = ponderadaGa ?? sum((g) => g.ga) / n;
  // Cartões (amarelos + vermelhos do time + amarelos do adversário) e escanteios
  // totais por jogo — base das linhas de Over de cartões/escanteios.
  const cardsVals = janela.map((g) =>
    g.yellow == null && g.oppYellow == null ? null : (g.yellow ?? 0) + (g.red ?? 0) + (g.oppYellow ?? 0),
  );
  const cornersVals = janela.map((g) =>
    g.corners == null && g.oppCorners == null ? null : (g.corners ?? 0) + (g.oppCorners ?? 0),
  );
  const cardsAvg = wAvgXg(cardsVals);
  const cornersAvg = wAvgXg(cornersVals);
  // Mescla 50% gols reais + 50% xG quando o xG existe; senão cai para gols puros.
  const weightedGfXg = xgF != null ? +(K_GOALS * gfBase + K_XG * xgF).toFixed(4) : gfBase;
  const weightedGaXg = xgA != null ? +(K_GOALS * gaBase + K_XG * xgA).toFixed(4) : gaBase;
  const pts = sum((g) => (g.res === "V" ? 3 : g.res === "E" ? 1 : 0));
  return {
    games: n, gfAvg: sum((g) => g.gf) / n, gaAvg: sum((g) => g.ga) / n,
    gfHome: home.length ? sum((g) => g.gf, home) / home.length : sum((g) => g.gf) / n,
    gaHome: home.length ? sum((g) => g.ga, home) / home.length : sum((g) => g.ga) / n,
    gfAway: away.length ? sum((g) => g.gf, away) / away.length : sum((g) => g.gf) / n,
    gaAway: away.length ? sum((g) => g.ga, away) / away.length : sum((g) => g.ga) / n,
    formPts: pts / (3 * n), csRate: games.filter((g) => g.ga === 0).length / n, scoredRate: games.filter((g) => g.gf > 0).length / n,
    weightedGf: gfBase,
    weightedGa: gaBase,
    xgF, xgA, xgCoverage, weightedGfXg, weightedGaXg, xgFonte,
    cardsAvg, cornersAvg,
  };
}

const fact = (n: number): number => (n <= 1 ? 1 : n * fact(n - 1));
// Peso da mescla gols/xG no λ (50% gols reais + 50% xG quando disponível).
export const K_GOALS = 0.5, K_XG = 0.5;
// Mescla DENTRO do λ: 65% da média já mesclada com xG + 35% do recorte do lado
// (casa/fora). São pesos diferentes dos de `teamRates` de propósito.
export const W_BASE_XG = 0.65, W_BASE_LADO = 0.35;
// Jogos "virtuais" da média da liga usados como prior na regressão à média.
export const PRIOR_JOGOS = 4;
// Ajuste de mando aplicado ao λ de cada lado.
export const HOME_ADV = 1.18, AWAY_ADJ = 0.92;

/** Regressão à média: amostra curta fica perto do prior (a média da liga). */
export function shrink(v: number, n: number, prior: number): number {
  return (n * v + PRIOR_JOGOS * prior) / (n + PRIOR_JOGOS);
}

/**
 * Forças de cada lado em relação à média da liga (1,00 = média).
 *
 * Exportada porque os **pilares** da tela de análise precisam abrir exatamente
 * a mesma conta que o λ usa. Se a fórmula mudar aqui, ela muda nos dois lugares
 * — um teste garante que `lambda ≈ leagueHalf × atk × def × mando`.
 */
export function forcasRelativas(rh: TeamRates, ra: TeamRates, leagueHalf: number) {
  const atkH = shrink(W_BASE_XG * rh.weightedGfXg + W_BASE_LADO * rh.gfHome, rh.games, leagueHalf) / leagueHalf;
  const defA = shrink(W_BASE_XG * ra.weightedGaXg + W_BASE_LADO * ra.gaAway, ra.games, leagueHalf) / leagueHalf;
  const atkA = shrink(W_BASE_XG * ra.weightedGfXg + W_BASE_LADO * ra.gfAway, ra.games, leagueHalf) / leagueHalf;
  const defH = shrink(W_BASE_XG * rh.weightedGaXg + W_BASE_LADO * rh.gaHome, rh.games, leagueHalf) / leagueHalf;
  return { atkH, defA, atkA, defH };
}
const pois = (k: number, l: number) => (Math.pow(l, k) * Math.exp(-l)) / fact(k);
/** P(X > linha) para X ~ Poisson(lambda). */
export function caudaPoisson(linha: number, lambda: number): number {
  if (!(lambda > 0)) return 0;
  const k = Math.floor(linha);
  let c = 0;
  for (let i = 0; i <= k; i++) c += pois(i, lambda);
  return Math.max(0, Math.min(1, 1 - c));
}
const LINHAS_CARTOES = [2.5, 3.5, 4.5, 5.5];
const LINHAS_ESCANTEIOS = [7.5, 8.5, 9.5, 10.5, 11.5];

/** λ e probabilidades de Over para cartões/escanteios, cruzando os dois times. */
function extrasDosTimes(rh: TeamRates, ra: TeamRates): Analysis["extras"] {
  const media = (a: number | null, b: number | null): { lambda: number; sample: number } => {
    const vals = [a, b].filter((v): v is number => v != null && Number.isFinite(v));
    return { lambda: vals.length ? +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2) : 0, sample: vals.length };
  };
  const cards = media(rh.cardsAvg, ra.cardsAvg);
  const corners = media(rh.cornersAvg, ra.cornersAvg);
  return {
    cards: {
      lambda: cards.lambda, sample: cards.sample,
      probs: cards.lambda > 0 ? LINHAS_CARTOES.map((line) => ({ line, over: +caudaPoisson(line, cards.lambda).toFixed(4) })) : [],
    },
    corners: {
      lambda: corners.lambda, sample: corners.sample,
      probs: corners.lambda > 0 ? LINHAS_ESCANTEIOS.map((line) => ({ line, over: +caudaPoisson(line, corners.lambda).toFixed(4) })) : [],
    },
  };
}
const RHO = -0.06; // ajuste Dixon-Coles para placares baixos
function dcTau(x: number, y: number, lh: number, la: number) {
  if (x === 0 && y === 0) return 1 - lh * la * RHO;
  if (x === 0 && y === 1) return 1 + lh * RHO;
  if (x === 1 && y === 0) return 1 + la * RHO;
  if (x === 1 && y === 1) return 1 - RHO;
  return 1;
}

export type Analysis = {
  status: "ok" | "dados_insuficientes";
  model_type: "dc-poisson-1.0" | "fallback_simples" | "nenhum";
  sample: { home: number; away: number; leagueAvg: number | null };
  lambdaHome: number; lambdaAway: number;
  /** xG médio usado por cada time (null quando a fonte não trouxe) + cobertura. */
  xg: { home: number | null; away: number | null; coverage: number; fonte: "api-football" | "espn" | null };
  /** Mercados extras (Poisson sobre as médias dos últimos 10): cartões e escanteios. */
  extras: {
    cards: { lambda: number; probs: { line: number; over: number }[]; sample: number };
    corners: { lambda: number; probs: { line: number; over: number }[]; sample: number };
  };
  probs: { home: number; draw: number; away: number; over05: number; over15: number; over25: number; under25: number; btts: number; homeScore: number; awayScore: number; cleanSheetHome: number; cleanSheetAway: number } | null;
  topScores: { score: string; p: number }[];
  confidence: "alta" | "média" | "baixa";
  factors: string[];
  /** Cruzamento do H2H (últimos 7) com a expectativa dos últimos 10 jogos. */
  h2hAjuste: AjusteH2H | null;
  rates: { home: TeamRates; away: TeamRates };
  narrative: { resumo: string; mandante: string; visitante: string; decisivos: string[]; cenarios: string[]; conclusao: string; alerta: string | null; mercados: string[] };
  updatedAt: string;
};

export function runModel(homeName: string, awayName: string, homeGames: HistGame[], awayGames: HistGame[], leagueAvgGoals = 2.65, h2h?: { games: any[] }): Analysis {
  const rh = teamRates(homeGames), ra = teamRates(awayGames);
  const base: Analysis = {
    status: "dados_insuficientes", model_type: "nenhum", sample: { home: rh.games, away: ra.games, leagueAvg: leagueAvgGoals },
    lambdaHome: 0, lambdaAway: 0, xg: { home: null, away: null, coverage: 0, fonte: null }, extras: { cards: { lambda: 0, probs: [], sample: 0 }, corners: { lambda: 0, probs: [], sample: 0 } }, probs: null, topScores: [], confidence: "baixa", factors: [], h2hAjuste: null,
    rates: { home: rh, away: ra },
    narrative: { resumo: "Análise em processamento. O histórico recente deste confronto ainda está sendo indexado pelo modelo.", mandante: "", visitante: "", decisivos: [], cenarios: [], conclusao: "", alerta: null, mercados: [] },
    updatedAt: new Date().toISOString(),
  };
  if (rh.games === 0 || ra.games === 0) return base;

  const fallback = rh.games < 5 || ra.games < 5;
  const leagueHalf = leagueAvgGoals / 2;
  // Força relativa à média da liga, com regressão à média para amostras pequenas
  const { atkH, defA, atkA, defH } = forcasRelativas(rh, ra, leagueHalf);
  let lh = Math.max(0.15, Math.min(4.5, leagueHalf * atkH * defA * HOME_ADV));
  let la = Math.max(0.12, Math.min(4.2, leagueHalf * atkA * defH * AWAY_ADJ));
  if (fallback) { lh = Math.max(0.2, (rh.gfAvg + ra.gaAvg) / 2 * HOME_ADV); la = Math.max(0.15, (ra.gfAvg + rh.gaAvg) / 2 * AWAY_ADJ); }

  /* ---------- Cruzamento com o H2H (últimos 7 confrontos) ----------
     O histórico recente diz uma coisa; o confronto direto pode dizer outra.
     Quando são 0x0 e 1x0 sempre, o total esperado tem que cair — mas o H2H
     corrige, não manda: o fator é limitado a -15%/+10% (lib/formaRecente). */
  const h2hTotais = (h2h?.games ?? [])
    .slice(0, JANELA_H2H)
    .map((g: any) => Number(g?.homeScore ?? 0) + Number(g?.awayScore ?? 0))
    .filter((v) => Number.isFinite(v));
  const h2hMedia = h2hTotais.length ? mediaPonderada(h2hTotais).media : null;
  const h2hAjuste = ajusteH2H(h2hMedia, +(lh + la).toFixed(2), h2hTotais.length);
  if (h2hAjuste.aplicado) {
    lh = Math.max(0.1, lh * h2hAjuste.fator);
    la = Math.max(0.1, la * h2hAjuste.fator);
  }

  const MAX = 8;
  let pH = 0, pD = 0, pA = 0, total = 0;
  const grid: { score: string; p: number; x: number; y: number }[] = [];
  for (let x = 0; x <= MAX; x++) for (let y = 0; y <= MAX; y++) {
    let p = pois(x, lh) * pois(y, la);
    if (!fallback) p *= dcTau(x, y, lh, la);
    p = Math.max(0, p);
    total += p;
    grid.push({ score: `${x}-${y}`, p, x, y });
    if (x > y) pH += p; else if (x === y) pD += p; else pA += p;
  }
  pH /= total; pD /= total; pA /= total;
  const pOver = (line: number) => grid.filter((g) => g.x + g.y > line).reduce((s, g) => s + g.p, 0) / total;
  const btts = grid.filter((g) => g.x > 0 && g.y > 0).reduce((s, g) => s + g.p, 0) / total;
  const homeScores = grid.filter((g) => g.x > 0).reduce((s, g) => s + g.p, 0) / total;
  const awayScores = grid.filter((g) => g.y > 0).reduce((s, g) => s + g.p, 0) / total;
  const csHome = grid.filter((g) => g.y === 0).reduce((s, g) => s + g.p, 0) / total;
  const csAway = grid.filter((g) => g.x === 0).reduce((s, g) => s + g.p, 0) / total;
  const top = grid.sort((a, b) => b.p - a.p).slice(0, 6).map((g) => ({ score: g.score, p: +(g.p / total * 100).toFixed(1) }));

  const minSample = Math.min(rh.games, ra.games);
  const confidence: Analysis["confidence"] = fallback ? "baixa" : minSample >= 8 ? "alta" : "média";
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const f1 = (v: number) => v.toFixed(2);

  const factors: string[] = [
    `${homeName} marcou em ${pct(rh.scoredRate)} dos últimos ${rh.games} jogos (média ${f1(rh.gfAvg)} gols, ${f1(rh.gfHome)} em casa).`,
    `${awayName} sofreu média de ${f1(ra.gaAvg)} gols (${f1(ra.gaAway)} fora) e manteve ${pct(ra.csRate)} de clean sheets.`,
    `Aproveitamento recente: ${homeName} ${pct(rh.formPts)} × ${awayName} ${pct(ra.formPts)}.`,
  ];
  if (h2hAjuste.aplicado) factors.push(h2hAjuste.texto);
  else if (h2h?.games?.length) factors.push(`${h2hAjuste.texto} (${h2h.games.length} confrontos no histórico).`);

  const fav = pH >= pD && pH >= pA ? "home" : pA >= pD ? "away" : "draw";
  const avgCornersH = avg(homeGames.map((g) => g.corners)), avgCornersA = avg(awayGames.map((g) => g.corners));
  const avgFoulsH = avg(homeGames.map((g) => g.fouls)), avgFoulsA = avg(awayGames.map((g) => g.fouls));
  const mercados: string[] = [];
  const overHits = homeGames.filter((g) => g.gf + g.ga > 2.5).length;
  if (homeGames.length >= 5) mercados.push(`Over 2.5 gols ocorreu em ${overHits}/${homeGames.length} jogos recentes do ${homeName}.`);
  if (avgCornersH != null && avgCornersA != null) mercados.push(`Escanteios: média somada de ${(avgCornersH + avgCornersA).toFixed(1)}/jogo (${homeName} ${avgCornersH.toFixed(1)} + ${awayName} ${avgCornersA.toFixed(1)}).`);
  if (avgFoulsH != null && avgFoulsA != null) mercados.push(`Faltas: ${(avgFoulsH + avgFoulsA).toFixed(1)} por jogo somando as duas equipes.`);

  const narrative = {
    resumo: `${homeName} (${fmtForm(homeGames)}) recebe ${awayName} (${fmtForm(awayGames)}). O modelo ${fallback ? "simplificado" : "Dixon-Coles/Poisson"} projeta ${f1(lh)} gols esperados para o mandante e ${f1(la)} para o visitante, com base nos últimos ${Math.min(rh.games, JANELA_FORMA)} e ${Math.min(ra.games, JANELA_FORMA)} jogos, com peso maior para os 3 mais recentes, e no mando de campo.`,
    mandante: `${homeName}: ataque de ${f1(rh.gfHome)} gols/jogo em casa, defesa sofrendo ${f1(rh.gaHome)}. Marcou em ${pct(rh.scoredRate)} dos jogos e venceu ${homeGames.filter((g) => g.res === "V").length} dos últimos ${rh.games}.`,
    visitante: `${awayName}: ${f1(ra.gfAway)} gols/jogo fora, sofrendo ${f1(ra.gaAway)}. Clean sheets em ${pct(ra.csRate)} da amostra; venceu ${awayGames.filter((g) => g.res === "V").length} dos últimos ${ra.games}.`,
    decisivos: factors,
    cenarios: [
      `Vitória do ${homeName} (${pct(pH)}): cenário em que o mando de campo e o ataque de ${f1(rh.gfHome)} gols em casa prevalecem.`,
      `Empate (${pct(pD)}): jogo equilibrado, provável se ${awayName} repetir a solidez defensiva de ${f1(ra.gaAway)} gols sofridos fora.`,
      `Vitória do ${awayName} (${pct(pA)}): visitante cresce se explorar a média de ${f1(rh.gaHome)} gols sofridos pelo mandante em casa.`,
    ],
    conclusao: `Cenário mais provável: ${fav === "home" ? `vitória do ${homeName}` : fav === "away" ? `vitória do ${awayName}` : "empate"} (${pct(Math.max(pH, pD, pA))}). Probabilidade estimada, não garantia — o futebol mantém ~${pct(1 - Math.max(pH, pD, pA))} de chance para os demais desfechos.`,
    alerta: fallback ? `Atenção: amostra reduzida (${rh.games} e ${ra.games} jogos). Modelo simplificado ativo — confiabilidade baixa.` : minSample < 8 ? `Amostra moderada (${minSample} jogos mínimos) — confiabilidade média.` : null,
    mercados,
  };

  return {
    status: "ok", model_type: fallback ? "fallback_simples" : "dc-poisson-1.0",
    sample: { home: rh.games, away: ra.games, leagueAvg: leagueAvgGoals },
    h2hAjuste,
    lambdaHome: +lh.toFixed(2), lambdaAway: +la.toFixed(2),
    xg: { home: rh.xgF, away: ra.xgF, coverage: Math.min(rh.xgCoverage, ra.xgCoverage), fonte: rh.xgFonte === "api-football" && ra.xgFonte === "api-football" ? "api-football" : rh.xgFonte ?? ra.xgFonte },
    probs: { home: +pH.toFixed(4), draw: +pD.toFixed(4), away: +pA.toFixed(4), over05: +pOver(0.5).toFixed(4), over15: +pOver(1.5).toFixed(4), over25: +pOver(2.5).toFixed(4), under25: +pOver(2.5) <= 1 ? +(1 - pOver(2.5)).toFixed(4) : 0, btts: +btts.toFixed(4), homeScore: +homeScores.toFixed(4), awayScore: +awayScores.toFixed(4), cleanSheetHome: +csHome.toFixed(4), cleanSheetAway: +csAway.toFixed(4) },
    topScores: top, confidence, factors, rates: { home: rh, away: ra },
    extras: extrasDosTimes(rh, ra), narrative, updatedAt: new Date().toISOString(),
  };
}

function avg(arr: (number | null)[]): number | null {
  const v = arr.filter((x): x is number => x != null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}
function fmtForm(games: HistGame[]) {
  const s = games.slice(0, 5).map((g) => g.res).join("");
  return s ? `forma ${s}` : "sem histórico";
}