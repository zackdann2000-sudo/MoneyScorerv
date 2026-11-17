"use client";

import { useState } from "react";
import { Star } from "lucide-react";

/**
 * Alternância entre "Principais Ligas" (padrão) e "Todas as Ligas".
 *
 * O estado vive em cada tela, com padrão LIGADO. Não persistimos em localStorage
 * de propósito: manter o padrão previsível evita que um usuário que desligou uma
 * vez fique sem entender por que a lista veio "vazia" noutra sessão. Se um dia
 * for persistir, faça com useSyncExternalStore — useState+useEffect para ler
 * storage quebra a hidratação e a regra react-hooks/set-state-in-effect.
 */
export function usePrincipaisLigas(): [boolean, (v: boolean) => void] {
  const [principais, setPrincipais] = useState(true);
  return [principais, setPrincipais];
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
        className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-bold transition-colors ${
          principais ? "bg-acc text-bg" : "text-mut hover:text-ink"
        }`}
      >
        <Star size={11} /> Principais Ligas
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        aria-pressed={!principais}
        className={`h-7 px-2.5 rounded-full text-[11px] font-bold transition-colors ${
          !principais ? "bg-acc text-bg" : "text-mut hover:text-ink"
        }`}
      >
        Todas as Ligas
      </button>
    </div>
  );
}
