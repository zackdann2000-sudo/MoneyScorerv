"use client";

/**
 * Filtros de oportunidade compartilhados (Apitou, Edge, Forebet).
 *
 * Duas coisas sempre juntas:
 *   1. piso de 70% — por padrão o lixo fica oculto;
 *   2. chips da nata (Elite / Alto EV / Favoritos / Bombas).
 * A matemática fica em `src/lib/oportunidadeFiltros.ts`; aqui só há estado de UI.
 */
import { useMemo, useState } from "react";
import { Eye, EyeOff, SlidersHorizontal } from "lucide-react";
import {
  CHIPS,
  contarOcultasPeloPiso,
  contarPorChip,
  filtrarOportunidades,
  type ChipRapido,
  type OportunidadeFiltravel,
} from "@/lib/oportunidadeFiltros";

/** Estado + lista já filtrada. */
export function useFiltroOportunidades<T extends OportunidadeFiltravel>(lista: T[]) {
  const [mostrarAbaixoDe70, setMostrarAbaixoDe70] = useState(false);
  const [chips, setChips] = useState<ChipRapido[]>([]);

  const ocultasPeloPiso = useMemo(() => contarOcultasPeloPiso(lista), [lista]);
  const contagem = useMemo(() => contarPorChip(lista), [lista]);
  const filtradas = useMemo(
    () => filtrarOportunidades(lista, { mostrarAbaixoDe70, chips }),
    [lista, mostrarAbaixoDe70, chips],
  );

  const toggleChip = (c: ChipRapido) =>
    setChips((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  return {
    filtradas,
    ocultasPeloPiso,
    contagem,
    mostrarAbaixoDe70,
    setMostrarAbaixoDe70,
    chips,
    toggleChip,
  };
}

/** Barra visual: toggle do piso + chips com contador. */
export default function FiltrosOportunidades({
  visiveis,
  total,
  ocultas,
  mostrarAbaixoDe70,
  onToggleAbaixo,
  chips,
  onToggleChip,
  contagem,
}: {
  visiveis: number;
  total: number;
  ocultas: number;
  mostrarAbaixoDe70: boolean;
  onToggleAbaixo: (v: boolean) => void;
  chips: ChipRapido[];
  onToggleChip: (c: ChipRapido) => void;
  contagem: Record<ChipRapido, number>;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wide text-mut">
          <SlidersHorizontal size={11} /> filtro dos filtros
        </span>
        <span className="ml-auto text-[9px] font-bold text-mut tabular-nums">
          {visiveis}/{total}
        </span>
        <button
          onClick={() => onToggleAbaixo(!mostrarAbaixoDe70)}
          aria-pressed={mostrarAbaixoDe70}
          title="Por padrão escondemos tudo abaixo de 70% de probabilidade do modelo"
          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-extrabold transition-colors ${
            mostrarAbaixoDe70
              ? "border-warn/60 bg-warn/15 text-warn"
              : "border-line bg-panel text-mut"
          }`}
        >
          {mostrarAbaixoDe70 ? <Eye size={10} /> : <EyeOff size={10} />}
          Mostrar &lt; 70%
          {ocultas > 0 && !mostrarAbaixoDe70 && <span className="opacity-70">({ocultas})</span>}
        </button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {CHIPS.map((c) => {
          const ativo = chips.includes(c.id);
          const n = contagem[c.id] ?? 0;
          return (
            <button
              key={c.id}
              onClick={() => onToggleChip(c.id)}
              aria-pressed={ativo}
              title={c.dica}
              disabled={n === 0 && !ativo}
              className={`shrink-0 h-7 rounded-full border px-2.5 text-[10px] font-extrabold transition-colors disabled:opacity-40 ${
                ativo ? "border-acc bg-acc text-black" : "border-line bg-panel text-ink"
              }`}
            >
              {c.rotulo} <span className="opacity-70">({n})</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
