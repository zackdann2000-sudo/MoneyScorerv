/**
 * Filtros de oportunidade: piso de 75%, Score Composto e chips de "nata".
 *
 * Módulo puro (sem React, sem I/O) para poder ser testado isolado. Toda a
 * matemática de corte vive aqui; as telas só escolhem quais chips estão ativos.
 */

/** Abaixo disso a linha é ruído: fica oculta por padrão em todas as telas. */
export const LIMIAR_PROB = 0.75;

/* Pesos do Score Composto, exatamente como especificado:
 *   score = probModelo(%) × 0,5 + EV(%) × 0,3 + TRUST × 2,0
 */
export const PESO_SCORE_PROB = 0.5;
export const PESO_SCORE_EV = 0.3;
export const PESO_SCORE_TRUST = 2;

/**
 * Corte do chip "Elite".
 *
 * Nota de calibração: com os pesos acima o máximo realista é ~72
 * (90% de prob = 45, EV de 25% = 7,5, TRUST 10 = 20). Por isso o corte é 70 e
 * não 80 — em 80 o chip ficaria permanentemente vazio, o que parece bug.
 */
export const ELITE_SCORE_MIN = 70;
/** EV (%) mínimo do chip "Alto EV". */
export const ALTO_EV_MIN = 15;
/** Odd máxima do chip "Favoritos". */
export const FAVORITO_ODD_MAX = 1.6;
/** Odd mínima do chip "Bombas". */
export const BOMBA_ODD_MIN = 2.5;

export type ChipRapido = "elite" | "altoEv" | "favoritos" | "bombas";

export const CHIPS: { id: ChipRapido; rotulo: string; dica: string }[] = [
  { id: "elite", rotulo: "Elite", dica: `Score ≥ ${ELITE_SCORE_MIN} (prob 50% + EV 30% + TRUST)` },
  { id: "altoEv", rotulo: "Alto EV", dica: `EV ≥ +${ALTO_EV_MIN}%` },
  { id: "favoritos", rotulo: "Favoritos", dica: `Odd < ${FAVORITO_ODD_MAX.toFixed(2)}` },
  { id: "bombas", rotulo: "Bombas", dica: `Odd > ${BOMBA_ODD_MIN.toFixed(2)}` },
];

/** Mínimo que qualquer oportunidade precisa ter para ser filtrada. */
export type OportunidadeFiltravel = {
  /** probabilidade do modelo, 0..1 */
  probModelo: number;
  /** EV em pontos percentuais (ex.: 12.4 = +12,4%) */
  evPct: number;
  /** TRUST 0..10 (null quando não há amostra) */
  trust?: number | null;
  odd: number;
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Score Composto 0..100.
 * probModelo entra em PONTOS percentuais (0,74 → 74 × 0,5 = 37).
 * EV negativo não gera score negativo (piso em 0); EV acima de 40 não
 * "compra" a nota inteira (teto em 40 pontos de EV) — sem isso um EV de 300%
 * sozinho viraria score 100 e o filtro perderia o sentido.
 */
export function calcularScoreFinal(o: OportunidadeFiltravel): number {
  const prob = Number.isFinite(o.probModelo) ? clamp(o.probModelo, 0, 1) * 100 : 0;
  const ev = Number.isFinite(o.evPct) ? clamp(o.evPct, 0, 40) : 0;
  const trust = o.trust != null && Number.isFinite(o.trust) ? clamp(o.trust, 0, 10) : 0;
  return clamp(+(prob * PESO_SCORE_PROB + ev * PESO_SCORE_EV + trust * PESO_SCORE_TRUST).toFixed(1), 0, 100);
}

/** Esse item passa no chip? (chips isolados, cada um com sua regra) */
export function passaChip(o: OportunidadeFiltravel, chip: ChipRapido): boolean {
  switch (chip) {
    case "elite":
      return calcularScoreFinal(o) >= ELITE_SCORE_MIN;
    case "altoEv":
      return Number.isFinite(o.evPct) && o.evPct >= ALTO_EV_MIN;
    case "favoritos":
      return Number.isFinite(o.odd) && o.odd > 1 && o.odd < FAVORITO_ODD_MAX;
    case "bombas":
      return Number.isFinite(o.odd) && o.odd > BOMBA_ODD_MIN;
  }
}

/** Chips são OR entre si (Elite ou Alto EV), nunca AND — senão a lista zera. */
export function passaChips(o: OportunidadeFiltravel, chips: ChipRapido[]): boolean {
  if (!chips.length) return true;
  return chips.some((c) => passaChip(o, c));
}

/** Passa no piso de probabilidade? (mostrar=true ignora o piso) */
export function passaPiso(o: OportunidadeFiltravel, mostrarAbaixoDe70: boolean): boolean {
  if (mostrarAbaixoDe70) return true;
  return o.probModelo >= LIMIAR_PROB;
}

/** Aplicação final: piso + chips, na ordem que o usuário espera. */
export function filtrarOportunidades<T extends OportunidadeFiltravel>(
  lista: T[],
  opts: { mostrarAbaixoDe70?: boolean; chips?: ChipRapido[] } = {},
): T[] {
  const { mostrarAbaixoDe70 = false, chips = [] } = opts;
  return lista.filter((o) => passaPiso(o, mostrarAbaixoDe70) && passaChips(o, chips));
}

/** Quantas ficaram de fora pelo piso (para o texto "N ocultas"). */
export function contarOcultasPeloPiso<T extends OportunidadeFiltravel>(lista: T[]): number {
  return lista.filter((o) => !passaPiso(o, false)).length;
}

/** Quantos itens cada chip selecionaria (para o contador do chip). */
export function contarPorChip<T extends OportunidadeFiltravel>(
  lista: T[],
): Record<ChipRapido, number> {
  return {
    elite: lista.filter((o) => passaChip(o, "elite")).length,
    altoEv: lista.filter((o) => passaChip(o, "altoEv")).length,
    favoritos: lista.filter((o) => passaChip(o, "favoritos")).length,
    bombas: lista.filter((o) => passaChip(o, "bombas")).length,
  };
}
