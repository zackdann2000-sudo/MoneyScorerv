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

/**
 * TIERS de acesso — o que cada plano libera POR DIA.
 *
 * Separado de `PLANOS` (preço/período) de propósito: preço muda em promoção,
 * limite diário é regra de produto. O Stripe vende período; o tier define
 * quantas análises abrem por dia (ver `lib/quota.ts`).
 */
export type TierId = "free" | "starter" | "pro" | "expert";

export const TIERS: readonly { id: TierId; nome: string; porDia: string; precoMes: number | null; nota: string }[] = [
  { id: "free", nome: "Free", porDia: "1 análise por dia", precoMes: 0, nota: "Sem cartão. Contador zera à meia-noite." },
  { id: "starter", nome: "Starter", porDia: "6 análises por dia", precoMes: 14.9, nota: "Mercados principais e value bets." },
  { id: "pro", nome: "Pro", porDia: "20 análises por dia", precoMes: 29.9, nota: "Todos os mercados e props." },
  { id: "expert", nome: "Expert", porDia: "Ilimitado", precoMes: 49.9, nota: "Tudo, sem contador." },
];
