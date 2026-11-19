/**
 * Núcleo PURO de Value Bet — decide sem rede, sem banco, sem env.
 *
 * Recebe as probabilidades do modelo e as odds de mercado e devolve só os
 * mercados com valor: modelo ≥ 65%, odd entre 1.45 e 2.50 e edge > 0.
 *
 * Separado de `opportunitiesEngine.ts` (que faz o I/O) para poder ser testado
 * e reusado sem arrastar db/providers.
 */

export type MercadoValor = "home" | "draw" | "away" | "over25" | "under25" | "btts";

/** Odds de mercado em formato decimal (1/odd = probabilidade implícita). */
export type OddsMercado = {
  home?: number | null;
  draw?: number | null;
  away?: number | null;
  over?: number | null;
  under?: number | null;
  ou?: number | null;
  btts?: number | null;
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
  /** Frase de transparência pronta para a UI. */
  porque: string;
};

export const MIN_PROB = 0.65;
export const ODD_MIN = 1.45;
export const ODD_MAX = 2.5;
/** Tolerância entre a linha de odds e a linha avaliada (2.5). */
const TOL_LINHA = 0.01;

const pct = (v: number) => Math.round(v * 100);

type Candidato = { mercado: MercadoValor; rotulo: string; linha: number | null; prob: number; odd: number };

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
}): OportunidadeValor[] {
  const { meta, probs, odds, confianca, fonteOdd } = args;
  const minProb = args.minProb ?? MIN_PROB;
  const oddMin = args.oddMin ?? ODD_MIN;
  const oddMax = args.oddMax ?? ODD_MAX;
  if (!odds) return [];

  const cands: Candidato[] = [];

  // 1X2
  if (odds.home != null) cands.push({ mercado: "home", rotulo: "Vitória casa", linha: null, prob: probs.home, odd: odds.home });
  if (odds.draw != null) cands.push({ mercado: "draw", rotulo: "Empate", linha: null, prob: probs.draw, odd: odds.draw });
  if (odds.away != null) cands.push({ mercado: "away", rotulo: "Vitória fora", linha: null, prob: probs.away, odd: odds.away });

  // Over/Under — só quando a linha de mercado é 2.5 (senão cruzaríamos a
  // probabilidade de 2.5 com a odd de outra linha).
  const linhaOU = Number(odds.ou);
  const ouEh25 = Number.isFinite(linhaOU) && Math.abs(linhaOU - 2.5) <= TOL_LINHA;
  if (ouEh25 && odds.over != null) cands.push({ mercado: "over25", rotulo: "Over 2.5 gols", linha: 2.5, prob: probs.over25, odd: odds.over });
  if (ouEh25 && odds.under != null) cands.push({ mercado: "under25", rotulo: "Under 2.5 gols", linha: 2.5, prob: probs.under25, odd: odds.under });

  // Ambas marcam — só quando a fonte publica a odd do mercado.
  if (odds.btts != null) cands.push({ mercado: "btts", rotulo: "Ambas marcam", linha: null, prob: probs.btts, odd: odds.btts });

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
    const porque = `Modelo: ${pct(c.prob)}% de acerto | Odd: ${odd.toFixed(2)} | Valor Esperado: ${evPct >= 0 ? "+" : ""}${evPct.toFixed(1)}%`;
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
      porque,
    });
  }
  return out.sort((a, b) => b.valor - a.valor || b.evPct - a.evPct);
}
