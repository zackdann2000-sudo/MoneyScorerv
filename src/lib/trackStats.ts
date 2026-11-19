/**
 * Matemática do Track Record — módulo PURO (sem DB, sem rede).
 *
 * Unidade = % da banca (stake Half-Kelly × 100).
 *   Green → lucro de stake·(odd − 1)
 *   Red   → prejuízo de stake
 * ROI = lucro total / valor apostado total.
 */

export type TrackStats = {
  total: number;
  pendentes: number;
  greens: number;
  reds: number;
  hitRate: number | null;
  unidades: number;
  roi: number | null;
  stakeTotal: number;
};

export type TrackRowLike = { status: string; stake: number; odd: number };

export function calcularStats(rows: TrackRowLike[]): TrackStats {
  const totals = rows.filter((r) => r.status === "green" || r.status === "red");
  const greens = totals.filter((r) => r.status === "green");
  let unidades = 0;
  let stakeTotal = 0;
  for (const r of totals) {
    const un = Number(r.stake) * 100; // % da banca
    stakeTotal += un;
    unidades += r.status === "green" ? un * (Number(r.odd) - 1) : -un;
  }
  const hitRate = totals.length ? (greens.length / totals.length) * 100 : null;
  return {
    total: rows.length,
    pendentes: rows.length - totals.length,
    greens: greens.length,
    reds: totals.length - greens.length,
    hitRate,
    unidades: +unidades.toFixed(2),
    roi: stakeTotal > 0 ? +((unidades / stakeTotal) * 100).toFixed(2) : null,
    stakeTotal: +stakeTotal.toFixed(2),
  };
}