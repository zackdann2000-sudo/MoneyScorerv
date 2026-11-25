/**
 * CLV (Closing Line Value) e faixas de odd — módulo PURO.
 *
 * Sem DB, sem rede, sem `fetch`. É a matemática que a tela `/desempenho` e o
 * cron de liquidação usam; por isso ela mora aqui e não dentro da rota.
 *
 * ## O que o CLV prova
 *
 * CLV = (odd de abertura ÷ odd de fechamento) − 1, sempre na MESMA casa
 * (Pinnacle). Se publicamos 2.05 e a Pinnacle fechou em 1.92, o CLV é +6,8%:
 * o mercado andou na nossa direção depois do pick. Positivo não é acerto do
 * jogo — é prova de que o preço que pegamos era melhor do que o preço final.
 *
 * Regra que não pode mudar: CLV só existe quando as DUAS pontas são da
 * Pinnacle. Odd de outra casa em qualquer ponta não vira "aproximado" — vira
 * `null`, e a tela mostra "—". Nunca preenchemos lacuna com média inventada.
 */

/** Faixa de odd. `max: null` = faixa aberta para cima. */
export type FaixaOdd = { key: string; rotulo: string; min: number; max: number | null };

/**
 * Faixas do relatório. As quatro primeiras são as do produto; a de baixo
 * (`<1.20`) existe só para nenhuma pick ficar fora da conta sem aviso —
 * aparece na tela apenas quando tem pick liquidada.
 */
export const FAIXAS_ODD: FaixaOdd[] = [
  { key: "min", rotulo: "Abaixo de 1.20", min: 0, max: 1.2 },
  { key: "1.20-1.50", rotulo: "1.20–1.50", min: 1.2, max: 1.5 },
  { key: "1.50-2.00", rotulo: "1.50–2.00", min: 1.5, max: 2.0 },
  { key: "2.00-3.00", rotulo: "2.00–3.00", min: 2.0, max: 3.0 },
  { key: "3.00+", rotulo: "3.00+", min: 3.0, max: null },
];

/** Faixa a que a odd pertence. `null` = odd inválida (≤ 1 ou não finita). */
export function faixaDaOdd(odd: number | null | undefined): FaixaOdd | null {
  if (odd == null || !Number.isFinite(odd) || odd <= 1) return null;
  // Limite inferior fechado, superior aberto: [1.20, 1.50) — igual à convenção
  // de faixa de odd da casa, e evita que 1.50 caia em duas faixas.
  for (const f of FAIXAS_ODD) {
    if (odd >= f.min && (f.max == null || odd < f.max)) return f;
  }
  return FAIXAS_ODD[FAIXAS_ODD.length - 1];
}

/**
 * CLV em %. Positivo = a odd de fechamento caiu abaixo da odd que pegamos
 * (mercado foi na nossa direção). Arredonda em 2 casas.
 */
export function clvPct(abertura: number | null | undefined, fechamento: number | null | undefined): number | null {
  if (abertura == null || fechamento == null) return null;
  if (!Number.isFinite(abertura) || !Number.isFinite(fechamento)) return null;
  if (abertura <= 1 || fechamento <= 1) return null;
  return Math.round((abertura / fechamento - 1) * 10000) / 100;
}

/** Linha de entrada: o mínimo que a agregação precisa saber de uma pick. */
export type PickParaFaixa = {
  /** Odd publicada (abertura). Usada para achar a faixa. */
  odd: number | null;
  status: string; // "green" | "red" | "pendente" | ...
  /** CLV já calculado, em %. `null` quando falta uma das pontas. */
  clvPct: number | null;
};

export type LinhaFaixa = {
  key: string;
  rotulo: string;
  /** Picks com resultado (green + red). */
  liquidadas: number;
  greens: number;
  /** % de acerto na faixa, 1 casa. `null` sem liquidada. */
  acerto: number | null;
  /** ROI % com stake fixa de 1 unidade. `null` sem liquidada. */
  roi: number | null;
  /** Lucro em unidades. */
  lucro: number;
  /** Odd média publicada na faixa. */
  oddMedia: number | null;
  /** CLV médio (%) das picks com as duas pontas da Pinnacle. */
  clvMedio: number | null;
  /** Quantas picks da faixa têm CLV calculável. */
  comClv: number;
  /** % de picks com CLV > 0 entre as que têm CLV. */
  clvPositivoPct: number | null;
};

export type ResumoFaixas = {
  faixas: LinhaFaixa[];
  total: {
    liquidadas: number;
    acerto: number | null;
    roi: number | null;
    lucro: number;
    clvMedio: number | null;
    comClv: number;
    clvPositivoPct: number | null;
  };
  /** Picks sem odd válida — não entram em faixa nenhuma, mas são contadas. */
  semOdd: number;
};

const media = (xs: number[]): number | null =>
  xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 100) / 100 : null;

/**
 * Agrupa as picks por faixa de odd e devolve acerto, ROI e CLV médio.
 *
 * - ROI usa stake fixa de 1 unidade: green ganha (odd − 1), red perde 1.
 * - Pick pendente entra em `liquidadas: 0`? Não: ela não entra em nenhum
 *   denominador. Só green/red contam.
 * - CLV usa apenas as picks que têm as duas pontas (abertura e fechamento).
 */
export function agruparPorFaixa(picks: PickParaFaixa[]): ResumoFaixas {
  const acc = new Map<string, { greens: number; reds: number; lucro: number; odds: number[]; clvs: number[]; clvPos: number }>();
  for (const f of FAIXAS_ODD) acc.set(f.key, { greens: 0, reds: 0, lucro: 0, odds: [], clvs: [], clvPos: 0 });

  let semOdd = 0;
  for (const p of picks) {
    const faixa = faixaDaOdd(p.odd);
    if (!faixa) { semOdd++; continue; }
    const b = acc.get(faixa.key)!;
    if (p.odd != null && Number.isFinite(p.odd)) b.odds.push(p.odd);
    if (p.clvPct != null && Number.isFinite(p.clvPct)) { b.clvs.push(p.clvPct); if (p.clvPct > 0) b.clvPos++; }

    if (p.status === "green") { b.greens++; b.lucro += (p.odd ?? 1) - 1; }
    else if (p.status === "red") { b.reds++; b.lucro -= 1; }
  }

  const faixas: LinhaFaixa[] = FAIXAS_ODD.map((f) => {
    const b = acc.get(f.key)!;
    const liquidadas = b.greens + b.reds;
    const lucro = Math.round(b.lucro * 1000) / 1000;
    return {
      key: f.key,
      rotulo: f.rotulo,
      liquidadas,
      greens: b.greens,
      acerto: liquidadas ? Math.round((b.greens / liquidadas) * 1000) / 10 : null,
      roi: liquidadas ? Math.round((lucro / liquidadas) * 1000) / 10 : null,
      lucro,
      oddMedia: media(b.odds),
      clvMedio: media(b.clvs),
      comClv: b.clvs.length,
      clvPositivoPct: b.clvs.length ? Math.round((b.clvPos / b.clvs.length) * 1000) / 10 : null,
    };
  });

  const liquidadas = faixas.reduce((s, f) => s + f.liquidadas, 0);
  const greens = faixas.reduce((s, f) => s + f.greens, 0);
  const lucro = Math.round(faixas.reduce((s, f) => s + f.lucro, 0) * 1000) / 1000;
  const comClv = faixas.reduce((s, f) => s + f.comClv, 0);

  // Média ponderada pelo número de picks com CLV de cada faixa (mesma coisa que
  // a média sobre todas as picks: a soma dos CLVs ÷ quantidade).
  const somaClv = faixas.reduce((s, f) => s + (f.clvMedio ?? 0) * f.comClv, 0);
  const clvMedio = comClv ? Math.round((somaClv / comClv) * 100) / 100 : null;
  const clvPositivos = FAIXAS_ODD.reduce((s, f) => s + acc.get(f.key)!.clvPos, 0);

  return {
    faixas,
    total: {
      liquidadas,
      acerto: liquidadas ? Math.round((greens / liquidadas) * 1000) / 10 : null,
      roi: liquidadas ? Math.round((lucro / liquidadas) * 1000) / 10 : null,
      lucro,
      clvMedio,
      comClv,
      clvPositivoPct: comClv ? Math.round((clvPositivos / comClv) * 1000) / 10 : null,
    },
    semOdd,
  };
}
