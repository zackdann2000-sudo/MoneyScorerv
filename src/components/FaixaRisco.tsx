/**
 * Etiquetas visuais do Value Bet: FAIXA DE RISCO e ODD JUSTA (de-vig).
 *
 * Presentacional puro — serve em Server e Client Component. Cores fixas por
 * faixa (pedido do produto):
 *   🛡️ Favorito → azul
 *   ⚖️ Valor    → verde neon
 *   💣 Bomba    → laranja/vermelho
 *
 * Nenhum número é inventado aqui: sem `oddJusta` o componente não mostra nada.
 */
import { faixaRisco, type FaixaRisco } from "@/lib/valueBet";

type Visual = { emoji: string; label: string; classe: string; dica: string };

const VISUAL: Record<FaixaRisco, Visual> = {
  favorito: {
    emoji: "🛡️",
    label: "Favorito",
    classe: "border-sky-400/50 bg-sky-400/15 text-sky-300",
    dica: "Faixa Favorito: odd ≥ 1.25 e probabilidade do modelo acima de 55%. O pick de maior confiança.",
  },
  valor: {
    emoji: "⚖️",
    label: "Valor",
    classe: "border-acc/60 bg-acc/15 text-acc",
    dica: "Faixa Valor: odd entre 1.75 e 2.90 — onde o modelo costuma se descolar mais do preço da casa.",
  },
  bomba: {
    emoji: "💣",
    label: "Bomba",
    classe: "border-orange-400/60 bg-orange-500/15 text-orange-300",
    dica: "Faixa Bomba: odd acima de 2.90 com probabilidade do modelo acima de 25%. A mais arriscada — e a que mais erra.",
  },
};

/** Selo da faixa de risco; não renderiza nada quando o pick não tem faixa. */
export function FaixaTag({
  faixa,
  compacto = false,
}: {
  faixa: FaixaRisco | null | undefined;
  compacto?: boolean;
}) {
  if (!faixa) return null;
  const v = VISUAL[faixa];
  return (
    <span
      title={v.dica}
      className={`inline-flex items-center gap-1 rounded-full border font-extrabold uppercase tracking-wide cursor-help ${v.classe} ${
        compacto ? "px-1.5 py-0 text-[8px]" : "px-2 py-0.5 text-[9px]"
      }`}
    >
      <span aria-hidden>{v.emoji}</span>
      {v.label}
    </span>
  );
}

/** Selo calculado direto da odd + probabilidade, sem depender do motor. */
export function FaixaTagDeOdd({ odd, prob }: { odd: number | null | undefined; prob: number | null | undefined }) {
  if (odd == null || prob == null) return null;
  return <FaixaTag faixa={faixaRisco(Number(odd), Number(prob))} compacto />;
}

/**
 * Comparação de odds: "Casa 1.90 · Justa 2.02 (−6%)".
 *
 * A odd justa é a odd do mercado SEM a comissão da casa (de-vig). Como a casa
 * sempre embute margem, a justa é normalmente MAIOR que a da casa — a diferença
 * negativa mostra exatamente quanto a casa está cobrando. Quando a odd da casa
 * for maior que a justa, o strip fica verde (a casa está pagando acima do justo).
 */
export function OddJustaLinha({
  odd,
  oddJusta,
  margem,
  className = "",
}: {
  odd: number;
  oddJusta: number | null;
  margem?: number | null;
  className?: string;
}) {
  if (oddJusta == null) {
    return (
      <span className={`text-[9px] text-mut tabular-nums ${className}`}>
        Casa {odd.toFixed(2)} · justa indisponível
      </span>
    );
  }
  const folga = (odd / oddJusta - 1) * 100;
  const pagaAcima = folga > 0;
  const margemPct = margem != null ? Math.round(margem * 1000) / 10 : null;
  return (
    <span
      title={`Odd justa = odd da casa sem o overround do mercado${
        margemPct != null ? ` (margem da casa: ${margemPct}%)` : ""
      }. Casa acima da justa = a casa está pagando mais do que o preço justo.`}
      className={`inline-flex flex-wrap items-center gap-x-1.5 text-[9px] tabular-nums cursor-help ${className}`}
    >
      <span className="text-mut">
        Casa <b className="text-ink">{odd.toFixed(2)}</b>
      </span>
      <span className="text-mut">
        Justa <b className={pagaAcima ? "text-acc" : "text-ink"}>{oddJusta.toFixed(2)}</b>
      </span>
      <span className={`font-extrabold ${pagaAcima ? "text-acc" : "text-mut"}`}>
        {folga >= 0 ? "+" : ""}
        {folga.toFixed(1)}%
      </span>
      {margemPct != null && (
        <span className="text-[8px] text-mut/80">
          margem {margemPct.toFixed(1)}%
        </span>
      )}
    </span>
  );
}
