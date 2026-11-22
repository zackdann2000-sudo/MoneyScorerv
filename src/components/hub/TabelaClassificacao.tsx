import { Crest } from "@/components/ui";
import type { LinhaClassificacao } from "@/lib/hub/standings";
import { formaParaVed, tomDaZona, zonaDaPosicao, type Zona } from "@/lib/hub/zonas";

/**
 * Tabela de classificação.
 *
 * Server component puro (sem estado, sem fetch): recebe as linhas já lidas do
 * banco. A ordem das colunas segue o que o torcedor procura primeiro — posição,
 * time, pontos — e as colunas de detalhe (J, V, E, D) somem no celular estreito.
 */

const FORMA_TOM: Record<string, string> = {
  V: "bg-acc text-black",
  E: "bg-warn text-black",
  D: "bg-danger text-white",
};

function Forma({ form }: { form: string | null }) {
  const ved = formaParaVed(form);
  if (ved.length === 0) return <span className="text-[10px] text-mut">—</span>;
  return (
    <div className="flex gap-1 justify-end" title="5 últimos jogos (mais antigo → mais recente)">
      {ved.map((r, i) => (
        <span
          key={i}
          className={`w-4 h-4 rounded-sm inline-flex items-center justify-center text-[9px] font-extrabold ${FORMA_TOM[r] ?? "bg-panel2 text-mut"}`}
        >
          {r}
        </span>
      ))}
    </div>
  );
}

function Num({ v, className = "" }: { v: number; className?: string }) {
  return <span className={`tabular-nums font-bold ${className}`}>{v}</span>;
}

export default function TabelaClassificacao({
  rows,
  zonas,
}: {
  rows: LinhaClassificacao[];
  zonas: Zona[];
}) {
  return (
    <div className="rounded-xl border border-line bg-panel overflow-hidden">
      <table className="w-full text-[11px] border-collapse">
        <caption className="sr-only">Tabela de classificação</caption>
        <thead>
          <tr className="bg-panel2 text-[9px] font-extrabold tracking-wider text-mut">
            <th scope="col" className="w-0 py-2 pl-2 pr-1 text-left">#</th>
            <th scope="col" className="py-2 pl-1 pr-2 text-left">TIME</th>
            <th scope="col" className="py-2 px-1 text-center">P</th>
            <th scope="col" className="py-2 px-1 text-center">J</th>
            <th scope="col" className="py-2 px-1 text-center max-sm:hidden">V</th>
            <th scope="col" className="py-2 px-1 text-center max-sm:hidden">E</th>
            <th scope="col" className="py-2 px-1 text-center max-sm:hidden">D</th>
            <th scope="col" className="py-2 px-1 text-center">SG</th>
            <th scope="col" className="py-2 pl-1 pr-2 text-right">FORMA</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const zona = zonaDaPosicao(zonas, r.position);
            const tom = zona ? tomDaZona(zona) : null;
            return (
              <tr key={r.teamId} className={`border-t border-line/60 ${tom ? tom.fundo : ""}`}>
                <td className="w-0 py-0 pl-0 pr-1">
                  <div className="flex items-center h-9">
                    <span className={`w-[3px] self-stretch ${tom ? tom.barra : "bg-transparent"}`} aria-hidden />
                    <span className={`pl-1.5 w-5 text-center font-display font-bold text-[12px] ${tom ? tom.texto : "text-mut"}`}>
                      {r.position}
                    </span>
                  </div>
                </td>
                <td className="py-1 pl-1 pr-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Crest src={r.teamLogo ?? undefined} size={18} alt={r.teamName} />
                    <span className="font-bold truncate">{r.teamName}</span>
                    {zona && <span className="sr-only">{tom?.rotulo}</span>}
                  </div>
                </td>
                <td className="px-1 text-center">
                  <Num v={r.points} className="text-[13px] font-display" />
                </td>
                <td className="px-1 text-center text-mut"><Num v={r.played} /></td>
                <td className="px-1 text-center text-mut max-sm:hidden"><Num v={r.wins} /></td>
                <td className="px-1 text-center text-mut max-sm:hidden"><Num v={r.draws} /></td>
                <td className="px-1 text-center text-mut max-sm:hidden"><Num v={r.losses} /></td>
                <td className={`px-1 text-center ${r.goalDiff > 0 ? "text-acc" : r.goalDiff < 0 ? "text-danger" : "text-mut"}`}>
                  <Num v={r.goalDiff} />
                </td>
                <td className="py-1 pl-1 pr-2">
                  <Forma form={r.form} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Legenda montada a partir das faixas que realmente apareceram na tabela. */
export function LegendaZonas({ zonas }: { zonas: Zona[] }) {
  if (zonas.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {zonas.map((z, i) => {
        const tom = tomDaZona(z);
        return (
          <span
            key={`${z.tipo}-${z.de}-${i}`}
            className={`inline-flex items-center gap-1 px-2 h-5 rounded-full border text-[9px] font-extrabold ${tom.chip}`}
            title={tom.faixa}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${tom.barra}`} aria-hidden />
            {tom.rotulo} · {tom.faixa}
          </span>
        );
      })}
    </div>
  );
}
