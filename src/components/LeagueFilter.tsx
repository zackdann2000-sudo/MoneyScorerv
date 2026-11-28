"use client";

import { Star } from "lucide-react";
import { TOTAL_LIGAS_PRINCIPAIS } from "@/lib/mainLeagues";

/**
 * Selo "Principais Ligas" — lista FECHADA no catálogo de `mainLeagues`.
 *
 * Não existe mais alternância para "Todas as Ligas": o produto só publica as
 * ligas de `src/lib/mainLeagues.ts` (hoje 18), então um botão para mostrar o resto só
 * servia para revelar ligas obscuras (Bolívia, divisões inferiores, copas
 * regionais). O filtro agora é fixo e o selo apenas confirma isso ao usuário.
 *
 * O hook mantém a assinatura `[boolean, setter]` de propósito: as telas já o
 * consomem e continuam aplicando `isMainLeague(...)` quando o valor é `true`.
 * O setter é no-op porque não há estado a mudar.
 */
const semEfeito = () => {};

export function usePrincipaisLigas(): [boolean, (v: boolean) => void] {
  return [true, semEfeito];
}

export default function LeagueFilterPill({
  principais,
  onChange,
  className = "",
}: {
  principais: boolean;
  onChange: (v: boolean) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Filtro de ligas"
      className={`inline-flex items-center rounded-full border border-line bg-panel p-0.5 ${className}`}
    >
      <button
        type="button"
        onClick={() => onChange(true)}
        aria-pressed={principais}
        className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-bold bg-acc text-bg"
        title={`Só as ${TOTAL_LIGAS_PRINCIPAIS} principais ligas`}
      >
        <Star size={11} /> Principais Ligas
      </button>
    </div>
  );
}
