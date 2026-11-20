import Link from "next/link";
import { Eye, EyeOff, SlidersHorizontal } from "lucide-react";
import { CHIPS, type ChipRapido } from "@/lib/oportunidadeFiltros";

/**
 * Mesma barra de filtros do app, só que em LINKS.
 *
 * Necessária nas telas renderizadas no servidor (/edge, /forebet): o estado vai
 * para a URL (`?min=1` e `?chip=elite,altoEv`), então funciona sem JavaScript,
 * sobrevive ao "voltar" do navegador e pode ser compartilhado por link.
 */
export default function FiltrosLinks({
  base,
  params,
  visiveis,
  total,
  ocultas,
  mostrarAbaixoDe70,
  chips,
  contagem,
}: {
  /** Rota, ex.: "/edge" */
  base: string;
  /** Parâmetros que NÃO podem se perder (aba, data…) */
  params: Record<string, string | undefined>;
  visiveis: number;
  total: number;
  ocultas: number;
  mostrarAbaixoDe70: boolean;
  chips: ChipRapido[];
  contagem: Record<ChipRapido, number>;
}) {
  const montar = (over: { min?: boolean; chips?: ChipRapido[] }) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v) q.set(k, v);
    });
    if (over.min) q.set("min", "1");
    const listaChips = over.chips ?? chips;
    if (listaChips.length) q.set("chip", listaChips.join(","));
    const qs = q.toString();
    return `${base}${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wide text-mut">
          <SlidersHorizontal size={11} /> filtro dos filtros
        </span>
        <span className="ml-auto text-[9px] font-bold text-mut tabular-nums">
          {visiveis}/{total}
        </span>
        <Link
          href={mostrarAbaixoDe70 ? montar({ min: false }) : montar({ min: true })}
          scroll={false}
          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-extrabold ${
            mostrarAbaixoDe70 ? "border-warn/60 bg-warn/15 text-warn" : "border-line bg-panel text-mut"
          }`}
        >
          {mostrarAbaixoDe70 ? <Eye size={10} /> : <EyeOff size={10} />}
          Mostrar &lt; 75%
          {ocultas > 0 && !mostrarAbaixoDe70 && <span className="opacity-70">({ocultas})</span>}
        </Link>
      </div>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {CHIPS.map((c) => {
          const ativo = chips.includes(c.id);
          const proximos = ativo ? chips.filter((x) => x !== c.id) : [...chips, c.id];
          const n = contagem[c.id] ?? 0;
          return (
            <Link
              key={c.id}
              href={montar({ chips: proximos })}
              scroll={false}
              title={c.dica}
              className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold ${
                ativo ? "border-acc bg-acc text-black" : n === 0 ? "border-line bg-panel text-mut opacity-50" : "border-line bg-panel text-ink"
              }`}
            >
              {c.rotulo} <span className="opacity-70">({n})</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
