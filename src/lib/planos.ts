/**
 * Catálogo de planos — FONTE ÚNICA de preço e período.
 *
 * Por que este arquivo existe separado de `lib/stripe.ts`:
 * `app/planos/page.tsx` é um client component. Importar `lib/stripe.ts` dali
 * arrastaria `@/db` e o SDK do Stripe para o bundle do navegador. Este módulo
 * é puro: sem banco, sem env, sem rede — pode ser importado dos dois lados.
 *
 * O `priceId` (que é segredo de configuração) é anexado só no servidor, em
 * `lib/stripe.ts::planos()`.
 */

export type PlanoId = "mensal" | "anual";

export type Plano = {
  id: PlanoId;
  nome: string;
  /** Valor cheio cobrado no período. */
  preco: number;
  /** Valor por mês, só para exibição. */
  precoMes: number;
  periodo: string;
  destaque?: boolean;
  /** Dias de acesso por pagamento — usado para calcular `expiresAt`. */
  dias: number;
};

export const PLANOS: readonly Plano[] = [
  {
    id: "mensal",
    nome: "VIP Mensal",
    preco: 29.9,
    precoMes: 29.9,
    periodo: "por mês",
    dias: 30,
  },
  {
    id: "anual",
    nome: "VIP Anual",
    preco: 249.9,
    precoMes: 20.83,
    periodo: "por ano",
    destaque: true,
    dias: 365,
  },
];

export function planoPorId(id: string): Plano | undefined {
  return PLANOS.find((p) => p.id === id);
}

/** Formata em BRL. Centralizado para as duas telas nunca divergirem. */
export function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
