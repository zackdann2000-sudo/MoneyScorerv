/**
 * Utilitários numéricos compartilhados pelos módulos.
 *
 * Nasceu da engenharia reversa do nerdytips, mas não tem nada de específico
 * dele: qualquer fonte que devolva odd em formato variável usa o mesmo código.
 */

/**
 * Primeiro número de um trecho, aceitando vírgula decimal.
 *
 * `"▲ 2.80"` -> 2.8 · `"1,45"` -> 1.45 · `"•••"` -> null
 */
export function primeiroNumero(s: string): number | null {
  const m = String(s ?? "").match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return null;
  const v = Number(m[0].replace(",", "."));
  return Number.isFinite(v) ? v : null;
}

/** Odd em faixa plausível (1.01 a 1000), arredondada em centavos. */
export function oddValida(v: number): number | null {
  if (!Number.isFinite(v) || v < 1.01 || v > 1000) return null;
  return Math.round(v * 100) / 100;
}

/**
 * Odd **sempre em decimal**, qualquer que seja o formato que a fonte devolveu.
 *
 * Três formatos aparecem na prática:
 * - decimal: `2.80` (Brasil/Europa) — passa direto;
 * - americano: `-222` -> 1.45 e `+150` -> 2.50 (quem serve dos EUA costuma usar);
 * - fracionário: `1/2` -> 1.50 (formato de casa de apostas britânica).
 *
 * Sem normalizar, `-222` entra como número negativo e a tela mostra "-222" —
 * foi o que aconteceu no primeiro deploy do /nerdytips, porque a Vercel
 * responde de um IP dos EUA e o site troca o formato pela geolocalização.
 *
 * Devolve `null` para lixo de HTML ("•••", célula vazia) e para valores fora
 * da faixa, em vez de inventar uma odd.
 */
export function odd(s: string | number | null | undefined): number | null {
  if (s == null) return null;

  const t = String(s).replace(/[▲▼▾▴►◄]/g, " ").trim();
  if (!t) return null;

  // Fracionário: "1/2", "9/20", "5 / 2".
  const frac = t.match(/(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/);
  if (frac) {
    const a = Number(frac[1].replace(",", "."));
    const b = Number(frac[2].replace(",", "."));
    return b > 0 ? oddValida(a / b + 1) : null;
  }

  const v = primeiroNumero(t);
  if (v == null) return null;

  // Americano negativo sempre tem módulo >= 100; "-0.5" é lixo de HTML.
  if (v < 0) return Math.abs(v) >= 100 ? oddValida(1 + 100 / Math.abs(v)) : null;
  if (v >= 100) return oddValida(1 + v / 100); // +150 -> 2.50
  return oddValida(v);
}

/**
 * Odd total de uma combinada (produto das odds), com teto de segurança.
 *
 * Multiplicar 20 odds de 3.0 estoura a faixa útil de exibição; devolve `null`
 * quando o produto passa de 10.000 em vez de mostrar um número absurdo.
 */
export function oddCombinada(odds: (number | null | undefined)[]): number | null {
  let total = 1;
  let n = 0;
  for (const o of odds) {
    if (o == null || !Number.isFinite(o) || o < 1.01) continue;
    total *= o;
    n++;
  }
  if (n === 0) return null;
  return total <= 10_000 ? Math.round(total * 100) / 100 : null;
}
