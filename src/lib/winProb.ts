/**
 * Probabilidade de vitória AO VIVO (1X2) — módulo PURO.
 *
 * A pergunta que ele responde: "com o placar e o tempo de jogo que temos agora,
 * e com a pressão que os dois times estão criando, qual a chance de cada
 * resultado?" Não é uma previsão pré-jogo requentada: o placar entra como
 * verdade consumada e só os gols QUE AINDA VÃO ACONTECER são sorteados.
 *
 * Modelo:
 *   1. Intensidade de cada lado vem do xG estimado pelos lances reais da ESPN
 *      (chute no gol 0,30 · bloqueado 0,08 · para fora 0,04 — ordem de grandeza
 *      de xG por tipo de finalização), extrapolada para 90 min.
 *   2. Nos primeiros 45 min essa extrapolação é misturada com a média de liga
 *      (1,35 gol/equipe), porque 10 minutos de jogo não são amostra de nada.
 *   3. O momentum dos últimos 15 min entra como fator multiplicativo
 *      (0,65× a 1,35×): quem está pressionando agora produz mais no restante.
 *   4. Os gols restantes são independentes por lado (Poisson) e somados ao
 *      placar atual. Daí saem casa/empate/fora.
 *
 * Sem I/O, sem rede, sem banco: serve para a rota, a UI e teste.
 */

import { PESOS, type Lance } from "./momentum";

/** Média de gols por equipe por jogo em ligas de elite (prior). */
export const GOLS_POR_EQUIPE = 1.35;

/** Minutos de jogo para acreditar plenamente no ritmo observado. */
export const CONFIANCA_RITMO_MIN = 45;

/** xG aproximado por tipo de finalização. */
export const XG_POR_TIPO = {
  "shot-on-target": 0.3,
  "shot-blocked": 0.08,
  "shot-off-target": 0.04,
} as const;

/** Faixa do fator de pressão (simétrico em torno de 1,00 aos 50%). */
export const FATOR_MIN = 0.65;
export const FATOR_MAX = 1.35;

/** Teto de gols sorteados por lado no Poisson. */
const MAX_GOLS = 12;

/** Piso de tempo restante: aos 90' ainda existe acréscimo e um gol. */
const RESTANTE_MIN = 2;

export type Prob1X2 = { casa: number; empate: number; fora: number };

/** Placar em gols no momento do cálculo (vem do relógio/placar, não dos lances). */
export type PlacarGols = { casa: number; fora: number };

export type PontoProb = Prob1X2 & { min: number };

export type WinProbResultado = Prob1X2 & {
  minuto: number;
  placar: { casa: number; fora: number };
  /** Gols esperados no tempo que falta, por lado (já com o fator de pressão). */
  lambdaRestante: { casa: number; fora: number };
  /** xG estimado acumulado até o minuto. */
  xg: { casa: number; fora: number };
  /** Divisão de pressão da janela (null quando não houve lance nela). */
  pressaoPct: { casa: number; fora: number } | null;
  /** Lances que entraram na conta. */
  lances: number;
};

export type WinProbPayload = { atual: WinProbResultado; serie: PontoProb[] };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const ehGol = (l: Lance) => l.tipo === "goal" || l.tipo === "pen" || l.tipo === "own";

/** Placar até o minuto (gol contra conta para o adversário). */
export function placarAte(lances: Lance[], minuto: number): { casa: number; fora: number } {
  let casa = 0;
  let fora = 0;
  for (const l of lances) {
    if (l.minuto <= 0 || l.minuto > minuto || !ehGol(l)) continue;
    const autor = l.lado;
    const credito = l.tipo === "own" ? (autor === "home" ? "away" : "home") : autor;
    if (credito === "home") casa++;
    else fora++;
  }
  return { casa, fora };
}

/** xG estimado acumulado até o minuto, por lado. */
export function xgAte(lances: Lance[], minuto: number): { casa: number; fora: number } {
  let casa = 0;
  let fora = 0;
  for (const l of lances) {
    if (l.minuto <= 0 || l.minuto > minuto) continue;
    const xg = (XG_POR_TIPO as Record<string, number>)[l.tipo];
    if (!xg) continue;
    if (l.lado === "home") casa += xg;
    else fora += xg;
  }
  return { casa: +casa.toFixed(2), fora: +fora.toFixed(2) };
}

/**
 * Pressão (%) da janela que termina no minuto — mesma régua do gráfico de
 * momentum (peso por tipo de lance e decaimento de recência).
 */
export function pressaoAte(
  lances: Lance[],
  minuto: number,
  janela = 15,
): { casa: number; fora: number } | null {
  const desde = Math.max(0, minuto - janela);
  let casa = 0;
  let fora = 0;
  for (const l of lances) {
    if (l.minuto <= desde || l.minuto > minuto || l.minuto <= 0) continue;
    const distancia = Math.max(0, minuto - l.minuto);
    const decaimento = 1 - 0.5 * Math.min(1, distancia / janela);
    const peso = PESOS[l.tipo] * decaimento;
    if (l.lado === "home") casa += peso;
    else fora += peso;
  }
  const total = casa + fora;
  if (total <= 0) return null;
  const pctCasa = Math.round((casa / total) * 100);
  return { casa: pctCasa, fora: 100 - pctCasa };
}

/** λ de 90 min, misturando ritmo observado e prior conforme o jogo avança. */
export function lambdaBase(xgAcumulado: number, minuto: number): number {
  const peso = clamp(minuto / CONFIANCA_RITMO_MIN, 0, 1);
  const ritmo = minuto > 0 ? (xgAcumulado / minuto) * 90 : GOLS_POR_EQUIPE;
  return peso * ritmo + (1 - peso) * GOLS_POR_EQUIPE;
}

/** Fator de pressão: 50% → 1,00; 100% → 1,35; 0% → 0,65. */
export function fatorPressao(pct: number | null | undefined): number {
  if (pct == null) return 1;
  return clamp(0.65 + 0.7 * (clamp(pct, 0, 100) / 100), FATOR_MIN, FATOR_MAX);
}

function poissonPmf(k: number, lambda: number): number {
  // λ pequeno nesta aplicação; o fatorial direto é estável.
  let fat = 1;
  for (let i = 2; i <= k; i++) fat *= i;
  return Math.exp(-lambda) * Math.pow(lambda, k) / fat;
}

/**
 * 1X2 do jogo inteiro: placar atual + Poisson dos gols que faltam.
 * `diff` = golsCasa - golsFora no momento.
 */
export function prob1x2(diff: number, lambdaCasa: number, lambdaFora: number): Prob1X2 {
  const pc: number[] = [];
  const pf: number[] = [];
  for (let k = 0; k <= MAX_GOLS; k++) {
    pc.push(poissonPmf(k, lambdaCasa));
    pf.push(poissonPmf(k, lambdaFora));
  }
  let casa = 0;
  let empate = 0;
  let fora = 0;
  for (let i = 0; i <= MAX_GOLS; i++) {
    for (let j = 0; j <= MAX_GOLS; j++) {
      const p = pc[i] * pf[j];
      const saldo = diff + i - j;
      if (saldo > 0) casa += p;
      else if (saldo === 0) empate += p;
      else fora += p;
    }
  }
  const total = casa + empate + fora || 1;
  return {
    casa: +((casa / total) * 100).toFixed(1),
    empate: +((empate / total) * 100).toFixed(1),
    fora: +((fora / total) * 100).toFixed(1),
  };
}

/**
 * Cálculo no minuto atual (usado no card e no topo do gráfico).
 *
 * `placar` é opcional e existe para o chamador que TEM o placar oficial (o
 * cabeçalho da partida): a narração pode atrasar e esconder um gol recente, e
 * aí o card mostraria 0-0 enquanto o topo da tela mostra 1-0.
 */
export function calcularWinProb(
  lances: Lance[],
  opts: { minuto?: number; janela?: number; placar?: PlacarGols } = {},
): WinProbResultado | null {
  if (!lances?.length) return null;
  const minutoReal = opts.minuto ?? lances.reduce((m, l) => Math.max(m, l.minuto), 0);
  if (minutoReal <= 0) return null;
  const minuto = Math.min(minutoReal, 120);
  const janela = opts.janela ?? 15;

  const placar = opts.placar ?? placarAte(lances, minuto);
  const xg = xgAte(lances, minuto);
  const p = pressaoAte(lances, minuto, janela);

  const restante = Math.max(RESTANTE_MIN, 90 - Math.min(minuto, 90));
  const fCasa = fatorPressao(p?.casa);
  const fFora = fatorPressao(p?.fora);
  const lambdaCasa = (lambdaBase(xg.casa, minuto) * restante * fCasa) / 90;
  const lambdaFora = (lambdaBase(xg.fora, minuto) * restante * fFora) / 90;

  const prob = prob1x2(placar.casa - placar.fora, lambdaCasa, lambdaFora);
  return {
    ...prob,
    minuto: minutoReal,
    placar,
    lambdaRestante: { casa: +lambdaCasa.toFixed(2), fora: +lambdaFora.toFixed(2) },
    xg,
    pressaoPct: p,
    lances: lances.filter((l) => l.minuto > 0 && l.minuto <= minuto).length,
  };
}

/**
 * Série para o gráfico: um ponto a cada `passo` minutos, recalculando o modelo
 * com o placar, o xG e a pressão daquele momento. O último ponto é o minuto
 * atual, então a linha termina exatamente no número mostrado no card.
 */
export function serieWinProb(
  lances: Lance[],
  opts: { minuto?: number; passo?: number; janela?: number; desde?: number; placar?: PlacarGols } = {},
): PontoProb[] {
  if (!lances?.length) return [];
  const minutoReal = opts.minuto ?? lances.reduce((m, l) => Math.max(m, l.minuto), 0);
  if (minutoReal <= 0) return [];
  const passo = Math.max(1, opts.passo ?? 5);
  const janela = opts.janela ?? 15;
  const inicio = Math.max(opts.desde ?? 0, 0);

  const pontos: PontoProb[] = [];
  for (let m = Math.max(passo, inicio + passo); m < minutoReal; m += passo) {
    const r = calcularWinProb(lances, { minuto: m, janela });
    if (r) pontos.push({ min: m, casa: r.casa, empate: r.empate, fora: r.fora });
  }
  const atual = calcularWinProb(lances, { minuto: minutoReal, janela, placar: opts.placar });
  if (atual) pontos.push({ min: minutoReal, casa: atual.casa, empate: atual.empate, fora: atual.fora });
  return pontos;
}
