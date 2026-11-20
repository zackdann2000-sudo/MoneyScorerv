/**
 * Veredito Estatístico (Match Winner).
 *
 * Cruza duas fontes que já existem no app:
 *   • forma recente dos últimos 10 jogos  → peso 70%
 *   • histórico dos confrontos diretos     → peso 30%
 *
 * Regra do produto: se falta base, o campo sai `null` e a tela diz
 * "sem dados suficientes". Nunca preenchemos com média de liga.
 *
 * Módulo puro: sem I/O. Recebe os históricos já carregados.
 */

import { teamRates, caudaPoisson } from "./model";
import { resumirH2H } from "./h2hEngine";
/* Tipo derivado de `teamRates` — evita importar espn.ts (que puxa o banco) só
   por um tipo. Assim o módulo continua compilável e testável isolado. */
type HistGame = Parameters<typeof teamRates>[0][number];

export type ConfiancaVeredito = "alta" | "media" | "baixa";

export type Veredito = {
  /** Probabilidades finais (0..1). */
  probs: {
    home: number;
    draw: number;
    away: number;
    over25: number;
    under25: number;
    btts: number;
  };
  /** Cartões: só existe quando a fonte entrega cartões no histórico. */
  cartoes: {
    media: number;
    over35: number;
    over45: number;
    amostra: number;
  } | null;
  confianca: ConfiancaVeredito;
  /** Por que a confiança é essa — texto curto com os números. */
  motivoConfianca: string;
  lambdas: { casa: number; fora: number };
  base: {
    pesoForma: number;
    pesoH2H: number;
    jogosCasa: number;
    jogosFora: number;
    jogosH2H: number;
  };
  /** Justificativa legível, montada apenas com números reais. */
  texto: string;
};

export const PESO_FORMA_VEREDITO = 0.7;
export const PESO_H2H_VEREDITO = 0.3;
/** Abaixo disso não há base para cruzar. */
export const MIN_JOGOS_VEREDITO = 3;

const MAX_GOLS = 10;

const pois = (k: number, lambda: number): number => {
  let f = 1;
  for (let i = 2; i <= k; i++) f *= i;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / f;
};

/** Placar 0..10 × 0..10 → 1X2, Over 2.5 e BTTS de uma vez. */
function placarProbabilidades(lambdaCasa: number, lambdaFora: number) {
  let home = 0, draw = 0, away = 0, over25 = 0, btts = 0, total = 0;
  for (let i = 0; i <= MAX_GOLS; i++) {
    const pi = pois(i, lambdaCasa);
    for (let j = 0; j <= MAX_GOLS; j++) {
      const p = pi * pois(j, lambdaFora);
      total += p;
      if (i > j) home += p;
      else if (i === j) draw += p;
      else away += p;
      if (i + j > 2.5) over25 += p;
      if (i > 0 && j > 0) btts += p;
    }
  }
  const n = (v: number) => (total > 0 ? v / total : 0);
  return { home: n(home), draw: n(draw), away: n(away), over25: n(over25), btts: n(btts) };
}

const pct1 = (v: number) => Math.round(v * 100);

const desvioRelativo = (valores: number[]): number | null => {
  const ok = valores.filter((v) => Number.isFinite(v));
  if (ok.length < 3) return null;
  const media = ok.reduce((s, v) => s + v, 0) / ok.length;
  if (media <= 0) return null;
  const variancia = ok.reduce((s, v) => s + (v - media) ** 2, 0) / ok.length;
  return Math.sqrt(variancia) / media;
};

/**
 * @param homeGames últimos jogos do mandante (mais recente primeiro)
 * @param awayGames últimos jogos do visitante (mais recente primeiro)
 * @param h2hGames confrontos diretos com placar (qualquer orientação)
 */
export function vereditar(opts: {
  homeGames: HistGame[] | null | undefined;
  awayGames: HistGame[] | null | undefined;
  h2hGames: { golsCasa: number; golsFora: number; data?: string }[] | null | undefined;
  pesoH2H?: number;
}): Veredito | null {
  const home = (opts.homeGames || []).slice(0, 10);
  const away = (opts.awayGames || []).slice(0, 10);
  if (home.length < MIN_JOGOS_VEREDITO || away.length < MIN_JOGOS_VEREDITO) return null;

  const rh = teamRates(home);
  const ra = teamRates(away);

  /* ---- 70%: forma recente (λ de ataque × defesa cruzados) ---- */
  const lambdaCasaForma = (rh.weightedGfXg + ra.weightedGaXg) / 2;
  const lambdaForaForma = (ra.weightedGfXg + rh.weightedGaXg) / 2;

  /* ---- 30%: H2H (só gols; é o que a fonte entrega) ---- */
  const h2h = resumirH2H(
    (opts.h2hGames || []).map((g) => ({ golsCasa: Number(g.golsCasa), golsFora: Number(g.golsFora), data: g.data })),
  );
  const temH2H = !!h2h && h2h.total >= MIN_JOGOS_VEREDITO;
  const pesoH2H = temH2H ? (opts.pesoH2H ?? PESO_H2H_VEREDITO) : 0;
  const pesoForma = 1 - pesoH2H;

  let lambdaCasa = lambdaCasaForma;
  let lambdaFora = lambdaForaForma;
  if (temH2H && h2h) {
    const totalH2H =
      (opts.h2hGames || []).reduce((s, g) => s + Number(g.golsCasa) + Number(g.golsFora), 0) / h2h.total;
    const somaForma = lambdaCasaForma + lambdaForaForma;
    const fatiaCasa = somaForma > 0 ? lambdaCasaForma / somaForma : 0.5;
    const casaH2H = totalH2H * fatiaCasa;
    const foraH2H = totalH2H * (1 - fatiaCasa);
    lambdaCasa = pesoForma * lambdaCasaForma + pesoH2H * casaH2H;
    lambdaFora = pesoForma * lambdaForaForma + pesoH2H * foraH2H;
  }

  /* Piso/teto: sem isso um 0-0 isolado zera o ataque. */
  lambdaCasa = Math.min(4.5, Math.max(0.3, lambdaCasa));
  lambdaFora = Math.min(4.5, Math.max(0.3, lambdaFora));

  const p = placarProbabilidades(lambdaCasa, lambdaFora);

  /* ---- Cartões: média dos dois times (já inclui cartões do adversário) ---- */
  const cartoesValidos = [rh.cardsAvg, ra.cardsAvg].filter((v): v is number => v != null && Number.isFinite(v) && v > 0);
  const lambdaCartoes = cartoesValidos.length ? cartoesValidos.reduce((s, v) => s + v, 0) / cartoesValidos.length : null;
  const cartoes = lambdaCartoes
    ? {
        media: +lambdaCartoes.toFixed(2),
        over35: +caudaPoisson(3.5, lambdaCartoes).toFixed(4),
        over45: +caudaPoisson(4.5, lambdaCartoes).toFixed(4),
        amostra: cartoesValidos.length,
      }
    : null;

  /* ---- Confiança: tamanho da amostra + consistência dos placares ---- */
  const cv = desvioRelativo([...home, ...away].map((g) => g.gf + g.ga));
  const jogosH2H = h2h?.total || 0;
  const amostraCurta = home.length < 8 || away.length < 8;

  let confianca: ConfiancaVeredito;
  if (!amostraCurta && temH2H && (cv == null || cv <= 0.55)) confianca = "alta";
  else if (home.length >= 5 && away.length >= 5 && (cv == null || cv <= 0.85)) confianca = "media";
  else confianca = "baixa";

  const motivoConfianca =
    confianca === "alta"
      ? `${home.length}+${away.length} jogos de forma, ${jogosH2H} confrontos diretos e placares consistentes.`
      : confianca === "media"
        ? `Base parcial: ${home.length}+${away.length} jogos${temH2H ? ` e ${jogosH2H} H2H` : " sem H2H suficiente"}.`
        : `Amostra curta ou placares irregulares (${home.length}+${away.length} jogos${temH2H ? `, ${jogosH2H} H2H` : ", sem H2H"}).`;

  /* ---- Texto: só números reais ---- */
  const vitoriasCasa = home.filter((g) => g.res === "V").length;
  const partes: string[] = [];
  partes.push(
    `${vitoriasCasa > 0 ? `O mandante venceu ${vitoriasCasa} dos últimos ${home.length}` : `O mandante não venceu nos últimos ${home.length}`}`,
  );
  partes.push(`marcou ${rh.weightedGfXg.toFixed(2)} e sofreu ${rh.weightedGaXg.toFixed(2)} por jogo`);
  partes.push(`o visitante marca ${ra.weightedGfXg.toFixed(2)} e sofre ${ra.weightedGaXg.toFixed(2)}`);
  if (temH2H && h2h) {
    const golsH2H = (opts.h2hGames || []).reduce((s, g) => s + Number(g.golsCasa) + Number(g.golsFora), 0) / h2h.total;
    partes.push(`o H2H (${h2h.total} jogos) aponta ${golsH2H.toFixed(2)} gols por confronto`);
  }
  const texto = `${partes.join(", ")}. Cruzando forma (${pct1(pesoForma)}%) com H2H (${pct1(pesoH2H)}%): mandante ${pct1(p.home)}%, empate ${pct1(p.draw)}%, visitante ${pct1(p.away)}%.`;

  return {
    probs: {
      home: +p.home.toFixed(4),
      draw: +p.draw.toFixed(4),
      away: +p.away.toFixed(4),
      over25: +p.over25.toFixed(4),
      under25: +(1 - p.over25).toFixed(4),
      btts: +p.btts.toFixed(4),
    },
    cartoes,
    confianca,
    motivoConfianca,
    lambdas: { casa: +lambdaCasa.toFixed(3), fora: +lambdaFora.toFixed(3) },
    base: {
      pesoForma,
      pesoH2H,
      jogosCasa: home.length,
      jogosFora: away.length,
      jogosH2H,
    },
    texto,
  };
}

/** Alerta de divergência entre o veredito e a odd de mercado. */
export type AlertaVeredito = {
  /** casa | empate | fora | over25 | btts */
  mercado: "home" | "draw" | "away" | "over25" | "btts";
  rotulo: string;
  prob: number;
  odd: number;
  evPct: number;
};

/** EV acima disso vira alerta no radar. */
export const EV_ALERTA_VEREDITO = 10;

/**
 * Compara veredito × odd. Sem odd, sem alerta.
 * `EV = prob × odd − 1` em %.
 */
export function alertasVeredito(
  veredito: Veredito | null | undefined,
  odds: Partial<Record<"home" | "draw" | "away" | "over" | "btts", number | null | undefined>> | null | undefined,
): AlertaVeredito[] {
  if (!veredito || !odds) return [];
  const pares: { mercado: AlertaVeredito["mercado"]; rotulo: string; prob: number; odd: number | null | undefined }[] = [
    { mercado: "home", rotulo: "Vitória do mandante", prob: veredito.probs.home, odd: odds.home },
    { mercado: "draw", rotulo: "Empate", prob: veredito.probs.draw, odd: odds.draw },
    { mercado: "away", rotulo: "Vitória do visitante", prob: veredito.probs.away, odd: odds.away },
    { mercado: "over25", rotulo: "Over 2.5", prob: veredito.probs.over25, odd: odds.over },
    { mercado: "btts", rotulo: "Ambas marcam", prob: veredito.probs.btts, odd: odds.btts },
  ];
  return pares
    .filter((x): x is typeof x & { odd: number } => typeof x.odd === "number" && x.odd > 1)
    .map((x) => {
      const ev = (x.prob * x.odd - 1) * 100;
      return { mercado: x.mercado, rotulo: x.rotulo, prob: +x.prob.toFixed(4), odd: x.odd, evPct: +ev.toFixed(1) };
    })
    .filter((x) => x.evPct >= EV_ALERTA_VEREDITO)
    .sort((a, b) => b.evPct - a.evPct);
}
