/**
 * LADDER DE GOLS (Over/Under 0.5 → 6.5) — núcleo puro.
 *
 * Mesma matemática do resto do motor: Poisson sobre o λ total do confronto
 * (λ casa + λ fora, já com xG mesclado). Cada linha vira Over = P(X > linha) e
 * Under = 1 − Over. Nada é interpolado nem chutado: sem λ válido devolve [].
 *
 * A odd justa só aparece quando a fonte publica o par Over/Under **daquela
 * linha** — com um lado só não existe overround para remover (mesma regra do
 * de-vig em `valueBet.ts`).
 */
import { caudaPoisson } from "./model";
import { desvigar, oddJustaDe } from "./valueBet";

/** Linhas publicadas no ladder (as mesmas do 180Score). */
export const LINHAS_GOLS = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5];

/** Tolerância para casar a linha do mercado com a linha do ladder. */
const TOL_LINHA = 0.01;

export type LadoOdd = "over" | "under";

export type LinhaLadder = {
  linha: number;
  /** P(mais de `linha` gols), 0..1. */
  over: number;
  /** P(menos de `linha` gols), 0..1. */
  under: number;
  /** Odd da casa para o lado destacado (null quando a fonte não publica a linha). */
  oddMercado: number | null;
  /** Odd justa (sem comissão) do mesmo lado. */
  oddJusta: number | null;
  /** Qual lado tem a odd publicada. */
  ladoOdd: LadoOdd | null;
};

export type OddsGols = {
  /** Linha publicada pela fonte (ex.: 2.5). */
  ou?: number | null;
  over?: number | null;
  under?: number | null;
};

/**
 * Projeta o ladder completo a partir do λ total.
 *
 * @param lambdaTotal  gols esperados do confronto (λ casa + λ fora)
 * @param odds         par Over/Under publicado pela fonte (opcional)
 */
export function projetarGols(
  lambdaTotal: number,
  odds?: OddsGols | null,
  linhas: number[] = LINHAS_GOLS,
): LinhaLadder[] {
  const lambda = Number(lambdaTotal);
  if (!Number.isFinite(lambda) || lambda <= 0) return [];

  const linhaMercado = Number(odds?.ou);
  const temLinha = Number.isFinite(linhaMercado);

  // Margem do par Over/Under publicado (uma vez, para a linha que casar).
  const margem =
    temLinha && (odds?.over != null || odds?.under != null)
      ? (desvigar([odds?.over, odds?.under])?.margem ?? null)
      : null;

  return linhas.map((linha) => {
    const over = +caudaPoisson(linha, lambda).toFixed(4);
    const under = +(1 - over).toFixed(4);

    let oddMercado: number | null = null;
    let oddJusta: number | null = null;
    let ladoOdd: LadoOdd | null = null;

    if (temLinha && Math.abs(linhaMercado - linha) <= TOL_LINHA) {
      // Destaca o lado que o modelo favorece (é o que a casa costuma pagar melhor).
      const lado: LadoOdd = over >= under ? "over" : "under";
      const bruta = Number(lado === "over" ? odds?.over : odds?.under);
      if (Number.isFinite(bruta) && bruta > 1) {
        oddMercado = +bruta.toFixed(2);
        const justa = oddJustaDe(bruta, margem);
        oddJusta = justa?.oddJusta ?? null;
        ladoOdd = lado;
      }
    }

    return { linha, over, under, oddMercado, oddJusta, ladoOdd };
  });
}
