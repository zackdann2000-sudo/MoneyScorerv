/**
 * Bloco "Padrões Estatísticos" da tela de detalhe do jogo (DumbleScore).
 *
 * Lê `hub_analysis.lab_insights` — os padrões que o motor extraiu dos últimos
 * jogos dos dois times — e mostra a solidez de cada um. Se o cache estiver
 * vazio, aparecem os dizeres de "Dados indisponíveis"; nunca um padrão
 * inventado.
 */
import { notaTemporal, padroesDoCache, type InsightCache } from "@/lib/hub/padroes";

type Props = { padroes: InsightCache[] };

export default function PadroesEstatisticos({ padroes }: Props) {
  const { itens, temporais, disponivel, aviso } = padroesDoCache(padroes);

  return (
    <div className="rounded-xl border border-line bg-panel p-3">
      {disponivel ? (
        <ul className="space-y-1.5">
          {itens.map((p, i) => (
            <li key={`${p.time}-${p.tipo}-${i}`} className="rounded-lg border border-line bg-panel2 p-2">
              <div className="flex items-center gap-1.5">
                <span className="shrink-0 rounded-full border border-acc/40 bg-acc/10 px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wide text-acc">
                  {p.rotulo}
                </span>
                <span className="min-w-0 flex-1 truncate text-[10px] font-bold text-mut">{p.time}</span>
                <span className="shrink-0 text-[9px] font-bold text-mut tabular-nums">solidez {p.solidez}%</span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-ink">{p.texto}</p>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-acc" style={{ width: `${Math.min(100, p.solidez)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-2 text-center text-[11px] leading-snug text-mut">{aviso}</p>
      )}
      <p className="mt-2 border-t border-line pt-1.5 text-[9px] leading-snug text-mut">{notaTemporal(temporais)}</p>
    </div>
  );
}
