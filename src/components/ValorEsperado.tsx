/**
 * Linha de transparência do Value Bet: "Modelo: X% | Odd: Y | Valor Esperado: Z%".
 *
 * O rótulo "Valor Esperado" carrega um `title` explicando o conceito, e o
 * número do EV muda de cor conforme a força:
 *   - verde  (> 15%)
 *   - amarelo (5% a 15%)
 *   - cinza  (< 5%)
 *
 * Presentacional puro — serve tanto em Server Component quanto Client.
 */
import { stakeSugerida } from "@/lib/valueBet";

export const EV_TITLE =
  "Valor Esperado (EV) = probabilidade do modelo × odd − 1. Acima de 0 o modelo " +
  "enxerga lucro esperado no longo prazo. Verde > 15%, amarelo 5–15%, cinza < 5%. " +
  "EV positivo não é garantia de acerto.";

export const STAKE_TITLE =
  "Stake sugerida pelo Critério de Kelly: f = (odd × p − 1) / (odd − 1), limitada a " +
  "5% da banca por aposta (gestão de risco). 0% = sem valor, não apostar.";

/** Cor do EV por faixa. */
export function evCor(ev: number): string {
  if (ev > 15) return "text-acc";
  if (ev >= 5) return "text-warn";
  return "text-mut";
}

export function PorqueValor({
  probModelo,
  odd,
  evPct,
}: {
  probModelo: number;
  odd: number;
  evPct: number;
}) {
  const sinal = evPct >= 0 ? "+" : "";
  const stake = stakeSugerida(probModelo, odd) * 100;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1">
      <span>Modelo: {Math.round(probModelo * 100)}% de acerto</span>
      <span className="opacity-60">|</span>
      <span>Odd: {odd.toFixed(2)}</span>
      <span className="opacity-60">|</span>
      <span
        title={EV_TITLE}
        className="cursor-help underline decoration-dotted underline-offset-2"
      >
        Valor Esperado
      </span>
      <span className={`font-extrabold tabular-nums ${evCor(evPct)}`}>
        : {sinal}
        {evPct.toFixed(1)}%
      </span>
      <span className="opacity-60">·</span>
      <span title={STAKE_TITLE} className="cursor-help underline decoration-dotted underline-offset-2">
        Stake
      </span>
      <span className="font-extrabold tabular-nums text-acc">: {stake.toFixed(1)}% da banca</span>
    </span>
  );
}
