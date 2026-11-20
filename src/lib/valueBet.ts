/**
 * Núcleo PURO de Value Bet — decide sem rede, sem banco, sem env.
 *
 * Recebe as probabilidades do modelo e as odds de mercado e devolve só os
 * mercados com valor: modelo ≥ 65%, odd entre 1.45 e 2.50 e edge > 0.
 *
 * Separado de `opportunitiesEngine.ts` (que faz o I/O) para poder ser testado
 * e reusado sem arrastar db/providers.
 */

export type MercadoValor =
  | "home"
  | "draw"
  | "away"
  | "over25"
  | "under25"
  | "btts"
  | "cards_over"
  | "cards_under"
  | "corners_over"
  | "corners_under";

/** Odds de mercado em formato decimal (1/odd = probabilidade implícita). */
export type OddsMercado = {
  home?: number | null;
  draw?: number | null;
  away?: number | null;
  over?: number | null;
  under?: number | null;
  ou?: number | null;
  btts?: number | null;
  /** Linha e odds de cartões (Over/Under) quando a fonte publica. */
  cards?: { linha: number; over?: number | null; under?: number | null } | null;
  /** Linha e odds de escanteios (Over/Under) quando a fonte publica. */
  corners?: { linha: number; over?: number | null; under?: number | null } | null;
  provider?: string | null;
};

/** Apenas os campos usados pela decisão de valor (subconjunto do modelo). */
export type ModelProbs = {
  home: number;
  draw: number;
  away: number;
  over25: number;
  under25: number;
  btts: number;
};

export type Confianca = "alta" | "média" | "baixa";

/**
 * Faixas de risco do pick (as três do Pronostic.io, regra pública deles).
 *
 * A ORDEM DE CHECAGEM IMPORTA: a faixa é decidida pela **odd** primeiro, porque
 * as três janelas de odd não se sobrepõem (1.25–1.75 · 1.75–2.90 · > 2.90).
 * A probabilidade entra como filtro dentro da janela. Assim uma odd 3.50 com
 * 60% de probabilidade é Bomba (não Favorito), e uma odd 1.50 com 40% não é
 * nada — não inventamos faixa para pick sem confiança.
 */
export type FaixaRisco = "favorito" | "valor" | "bomba";

/** Odd mínima do Favorito (cobertura de resultado provável). */
export const FAVORITO_ODD_MIN = 1.25;
/** Probabilidade mínima do Favorito. */
export const FAVORITO_PROB_MIN = 0.55;
/** Início da janela de Valor (fim da janela de Favorito). */
export const VALOR_ODD_MIN = 1.75;
/** Fim da janela de Valor — acima disso é Bomba. */
export const VALOR_ODD_MAX = 2.9;
/** Probabilidade mínima da Bomba. */
export const BOMBA_PROB_MIN = 0.25;

export type MetaJogo = {
  matchId: string;
  league: string;
  leagueName: string;
  country: string;
  kickoff: string;
  estado: string;
  state: "pre" | "in" | "post";
  home: { id: string; name: string; logo: string };
  away: { id: string; name: string; logo: string };
};

export type OportunidadeValor = MetaJogo & {
  chave: string;
  mercado: MercadoValor;
  rotulo: string;
  linha: number | null;
  /** Probabilidade do modelo (0..1). */
  probModelo: number;
  /** Probabilidade implícita da odd (1/odd). */
  probImplicita: number;
  odd: number;
  /** Edge = probModelo − probImplicita (>0 = valor). */
  valor: number;
  /** Valor esperado em % de stake: (probModelo·odd − 1)·100. */
  evPct: number;
  confianca: Confianca;
  fonteOdd: string;
  /** Fração de Kelly sugerida (% da banca, 0..KELLY_CAP). 0 = não apostar. */
  stake: number;
  /**
   * Odd justa (fair odd): a odd do mercado sem o overround da casa.
   * `null` quando o mercado não é par (ex.: "ambas marcam" só com o lado sim) —
   * sem os dois lados não existe margem a remover.
   */
  oddJusta: number | null;
  /** Probabilidade implícita da odd justa (0..1). */
  probJusta: number | null;
  /** Overround do mercado em fração (0.06 = 6% de comissão embutida). */
  margemMercado: number | null;
  /** Quanto a casa paga abaixo da odd justa, em % (negativo = pagando menos). */
  folgaOddPct: number | null;
  /** true quando a odd da casa supera a odd justa (paga mais do que o justo). */
  ehValorOdd: boolean;
  /** Faixa de risco do pick (favorito/valor/bomba) ou null. */
  faixa: FaixaRisco | null;
  /** Frase de transparência pronta para a UI. */
  porque: string;
};

export const MIN_PROB = 0.65;
export const ODD_MIN = 1.45;
export const ODD_MAX = 2.5;
/** Teto de segurança de Kelly: nunca sugerir mais que 5% da banca por aposta. */
export const KELLY_CAP = 0.05;
/** Fração de Kelly usada: meio-Kelly (metade da fração ótima) reduz risco de ruína. */
export const KELLY_FRACAO = 0.5;
/** Tolerância entre a linha de odds e a linha avaliada (2.5). */
const TOL_LINHA = 0.01;

const pct = (v: number) => Math.round(v * 100);

/**
 * Critério de Kelly (fração ótima da banca):
 *   f = (odd · p − 1) / (odd − 1)
 * Devolve a fração (ex.: 0.025 = 2.5% da banca). Negativo = sem valor.
 */
export function calcularKelly(probModelo: number, odd: number): number {
  if (!Number.isFinite(probModelo) || !Number.isFinite(odd) || odd <= 1) return 0;
  return (odd * probModelo - 1) / (odd - 1);
}

/**
 * Stake sugerida com gestão de risco: Kelly limitado a [0, cap].
 * Kelly negativo (sem valor) vira 0; Kelly alto em odds altas é cortado no teto.
 */
export function stakeSugerida(probModelo: number, odd: number, cap = KELLY_CAP): number {
  const k = calcularKelly(probModelo, odd);
  if (k <= 0) return 0;
  // Meio-Kelly antes do teto: metade da fração ótima, limitada a 5% da banca.
  return Math.min(k * KELLY_FRACAO, cap);
}

type Candidato = {
  mercado: MercadoValor;
  rotulo: string;
  linha: number | null;
  prob: number;
  odd: number;
  /** Overround do mercado de origem (null = mercado não é par, ex. BTTS). */
  margem?: number | null;
};

/** Quanto da comissão é removida ao montar a odd justa (1 = remove toda). */
export const FRACAO_COMISSAO = 1;

export type MercadoDesvigado = {
  /** Soma das probabilidades implícitas (1/odd) de todos os lados. */
  somaImplicita: number;
  /** Overround em fração: somaImplicita − 1 (0.06 = 6% de margem). */
  margem: number;
  /** Divisor aplicado a cada 1/odd para chegar à probabilidade justa. */
  denominador: number;
  /** Odd justa de cada lado, na mesma ordem da entrada (null quando a odd era inválida). */
  oddsJustas: (number | null)[];
};

/**
 * Remove o overround de um mercado completo (todos os lados do MESMO mercado).
 *
 * Uma odd sozinha não tem margem: a comissão só aparece quando você soma as
 * probabilidades implícitas dos lados. Ex.: 1.90 / 3.40 / 4.20 →
 * 1/1.9 + 1/3.4 + 1/4.2 = 1.0588 → a casa está cobrando 5,9%.
 *
 * De-vig proporcional: cada 1/odd é dividido pela soma, então as probabilidades
 * justas somam exatamente 1. A odd justa é sempre ≥ a odd da casa (a casa paga
 * menos do que o preço justo — é aí que mora a comissão).
 *
 * `fracaoComissao` permite devolver só parte da margem (0.5 = devolve metade,
 * como faz o Pronostic.io); 1 (padrão) remove a comissão inteira.
 */
export function desvigar(
  odds: (number | null | undefined)[],
  fracaoComissao: number = FRACAO_COMISSAO,
): MercadoDesvigado | null {
  const validas = odds.map((o) => (Number.isFinite(Number(o)) && Number(o) > 1 ? Number(o) : null));
  const usaveis = validas.filter((o): o is number => o != null);
  // Com menos de dois lados não existe mercado, logo não existe margem.
  if (usaveis.length < 2) return null;

  const somaImplicita = usaveis.reduce((s, o) => s + 1 / o, 0);
  if (!Number.isFinite(somaImplicita) || somaImplicita <= 0) return null;

  const margem = +(somaImplicita - 1).toFixed(6);
  const f = Math.min(Math.max(fracaoComissao, 0), 1);
  // f = fração da comissão REMOVIDA: f = 1 tira a margem inteira, então o
  // divisor vira `somaImplicita` (1 + margem) e as probs justas somam 1.
  const denominador = 1 + f * Math.max(margem, 0);

  return {
    somaImplicita: +somaImplicita.toFixed(6),
    margem,
    denominador,
    oddsJustas: validas.map((o) => (o == null ? null : +(o * denominador).toFixed(3))),
  };
}

/**
 * Odd justa de um lado a partir da margem do mercado.
 *   oddJusta = odd × (1 + f × margem)
 * Devolve `null` para odd inválida ou margem não numérica.
 */
export function oddJustaDe(
  odd: number,
  margem: number | null,
  fracaoComissao: number = FRACAO_COMISSAO,
): { oddJusta: number; probJusta: number } | null {
  if (!Number.isFinite(odd) || odd <= 1 || margem == null || !Number.isFinite(margem)) return null;
  const f = Math.min(Math.max(fracaoComissao, 0), 1);
  const denominador = 1 + f * Math.max(margem, 0);
  const oddJusta = +(odd * denominador).toFixed(3);
  return { oddJusta, probJusta: +(1 / oddJusta).toFixed(4) };
}

/**
 * Classifica o pick em uma das três faixas de risco.
 *
 * Regra (janelas de odd, com filtro de probabilidade dentro de cada uma):
 *   Favorito → odd ≥ 1.25 e prob > 55%
 *   Valor    → odd entre 1.75 e 2.90
 *   Bomba    → odd > 2.90 e prob > 25%
 * `null` = não merece etiqueta (ex.: odd 1.50 com 40% de probabilidade).
 */
export function faixaRisco(odd: number, probModelo: number): FaixaRisco | null {
  if (!Number.isFinite(odd) || !Number.isFinite(probModelo)) return null;
  if (odd > VALOR_ODD_MAX) return probModelo > BOMBA_PROB_MIN ? "bomba" : null;
  if (odd >= VALOR_ODD_MIN) return "valor";
  if (odd >= FAVORITO_ODD_MIN) return probModelo > FAVORITO_PROB_MIN ? "favorito" : null;
  return null;
}

/**
 * Avalia um jogo já calculado (probs do modelo + odds de mercado) e devolve
 * apenas os mercados que passam em TODOS os filtros de valor.
 *
 * Puro: mesma entrada → mesma saída.
 */
export function avaliarOportunidades(args: {
  meta: MetaJogo;
  probs: ModelProbs;
  odds: OddsMercado | null;
  confianca: Confianca;
  fonteOdd: string;
  minProb?: number;
  oddMin?: number;
  oddMax?: number;
  /** Probabilidades de cartões/escanteios que o modelo calculou por linha. */
  extras?: {
    cards?: { probs: { line: number; over: number }[] };
    corners?: { probs: { line: number; over: number }[] };
  } | null;
}): OportunidadeValor[] {
  const { meta, probs, odds, confianca, fonteOdd } = args;
  const minProb = args.minProb ?? MIN_PROB;
  const oddMin = args.oddMin ?? ODD_MIN;
  const oddMax = args.oddMax ?? ODD_MAX;
  if (!odds) return [];

  const cands: Candidato[] = [];

  // Margem (overround) de cada mercado completo — é o que permite a odd justa.
  const m1x2 = desvigar([odds.home, odds.draw, odds.away])?.margem ?? null;
  const mOU = desvigar([odds.over, odds.under])?.margem ?? null;
  const mCards = odds.cards ? (desvigar([odds.cards.over, odds.cards.under])?.margem ?? null) : null;
  const mCorners = odds.corners ? (desvigar([odds.corners.over, odds.corners.under])?.margem ?? null) : null;

  // 1X2
  if (odds.home != null) cands.push({ mercado: "home", rotulo: "Vitória casa", linha: null, prob: probs.home, odd: odds.home, margem: m1x2 });
  if (odds.draw != null) cands.push({ mercado: "draw", rotulo: "Empate", linha: null, prob: probs.draw, odd: odds.draw, margem: m1x2 });
  if (odds.away != null) cands.push({ mercado: "away", rotulo: "Vitória fora", linha: null, prob: probs.away, odd: odds.away, margem: m1x2 });

  // Over/Under — só quando a linha de mercado é 2.5 (senão cruzaríamos a
  // probabilidade de 2.5 com a odd de outra linha).
  const linhaOU = Number(odds.ou);
  const ouEh25 = Number.isFinite(linhaOU) && Math.abs(linhaOU - 2.5) <= TOL_LINHA;
  if (ouEh25 && odds.over != null) cands.push({ mercado: "over25", rotulo: "Over 2.5 gols", linha: 2.5, prob: probs.over25, odd: odds.over, margem: mOU });
  if (ouEh25 && odds.under != null) cands.push({ mercado: "under25", rotulo: "Under 2.5 gols", linha: 2.5, prob: probs.under25, odd: odds.under, margem: mOU });

  // Ambas marcam — só quando a fonte publica a odd do mercado.
  if (odds.btts != null) cands.push({ mercado: "btts", rotulo: "Ambas marcam", linha: null, prob: probs.btts, odd: odds.btts });

  // Cartões e escanteios — Poisson sobre as médias dos últimos 10. Só cruza
  // com a odd quando a linha do mercado casa com a linha calculada pelo modelo.
  const probNaLinha = (arr: { line: number; over: number }[] | undefined, linha: number) =>
    arr?.find((p) => Math.abs(p.line - linha) <= TOL_LINHA)?.over ?? null;
  if (odds.cards) {
    const p = probNaLinha(args.extras?.cards?.probs, odds.cards.linha);
    if (p != null && odds.cards.over != null)
      cands.push({ mercado: "cards_over", rotulo: `Cartões Over ${odds.cards.linha}`, linha: odds.cards.linha, prob: p, odd: odds.cards.over, margem: mCards });
    if (p != null && odds.cards.under != null)
      cands.push({ mercado: "cards_under", rotulo: `Cartões Under ${odds.cards.linha}`, linha: odds.cards.linha, prob: 1 - p, odd: odds.cards.under, margem: mCards });
  }
  if (odds.corners) {
    const p = probNaLinha(args.extras?.corners?.probs, odds.corners.linha);
    if (p != null && odds.corners.over != null)
      cands.push({ mercado: "corners_over", rotulo: `Escanteios Over ${odds.corners.linha}`, linha: odds.corners.linha, prob: p, odd: odds.corners.over, margem: mCorners });
    if (p != null && odds.corners.under != null)
      cands.push({ mercado: "corners_under", rotulo: `Escanteios Under ${odds.corners.linha}`, linha: odds.corners.linha, prob: 1 - p, odd: odds.corners.under, margem: mCorners });
  }

  const out: OportunidadeValor[] = [];
  for (const c of cands) {
    const odd = Number(c.odd);
    if (!Number.isFinite(odd) || odd <= 1) continue;
    if (odd < oddMin || odd > oddMax) continue;
    if (c.prob < minProb) continue;
    const probImplicita = 1 / odd;
    const valor = c.prob - probImplicita;
    if (valor <= 0) continue;
    const evPct = +((c.prob * odd - 1) * 100).toFixed(1);
    const stake = stakeSugerida(c.prob, odd);
    // Odd justa: a mesma odd sem a comissão do mercado (de-vig).
    const justa = oddJustaDe(odd, c.margem ?? null);
    const folgaOddPct = justa ? +((odd / justa.oddJusta - 1) * 100).toFixed(1) : null;
    const porque = `Modelo: ${pct(c.prob)}% de acerto | Odd: ${odd.toFixed(2)} | Valor Esperado: ${evPct >= 0 ? "+" : ""}${evPct.toFixed(1)}% | Stake: ${(stake * 100).toFixed(1)}% da banca`;
    out.push({
      ...meta,
      chave: `${meta.matchId}:${c.mercado}`,
      mercado: c.mercado,
      rotulo: c.rotulo,
      linha: c.linha,
      probModelo: +c.prob.toFixed(4),
      probImplicita: +probImplicita.toFixed(4),
      odd: +odd.toFixed(2),
      valor: +valor.toFixed(4),
      evPct,
      confianca,
      fonteOdd,
      stake: +stake.toFixed(4),
      oddJusta: justa?.oddJusta ?? null,
      probJusta: justa?.probJusta ?? null,
      margemMercado: c.margem ?? null,
      folgaOddPct,
      ehValorOdd: justa ? odd > justa.oddJusta : false,
      faixa: faixaRisco(odd, c.prob),
      porque,
    });
  }
  return out.sort((a, b) => b.valor - a.valor || b.evPct - a.evPct);
}
