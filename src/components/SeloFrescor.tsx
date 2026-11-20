import { faixaIdade, rotuloIdade } from "@/lib/rankingsEngine";

/**
 * Selo "Atualizado há X" — a mesma régua de cor em todas as telas.
 *
 *   fresco  (< 24 h) → verde
 *   atencao (24–48 h) → amarelo
 *   defasado (≥ 48 h) → vermelho
 *   ausente → cinza ("sem registro")
 *
 * Componente de servidor: não tem estado nem interação.
 */
export default function SeloFrescor({
  idadeMs,
  titulo,
  className = "",
}: {
  idadeMs: number | null;
  titulo?: string;
  className?: string;
}) {
  const faixa = faixaIdade(idadeMs);
  const cor =
    faixa === "fresco"
      ? "text-acc"
      : faixa === "atencao"
        ? "text-warn"
        : faixa === "defasado"
          ? "text-red-400"
          : "text-mut";

  return (
    <span
      title={titulo}
      className={`inline-flex items-center gap-1 rounded-full border border-line bg-panel px-2 py-0.5 text-[9px] font-extrabold ${cor} ${className}`}
    >
      <span aria-hidden>🕒</span>
      Atualizado {rotuloIdade(idadeMs)}
    </span>
  );
}
