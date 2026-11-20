"use client";

/**
 * Bloco "Projeção de Gols (Over/Under)" da aba Pré-Live.
 *
 * Recebe o ladder já calculado pelo servidor (`/api/matches/[id]/analysis`) —
 * Poisson sobre o λ total do confronto, linhas 0.5 → 6.5.
 *
 * Cores: Over acima de 50% em verde neon, Under acima de 50% em laranja.
 * Sem dados, o bloco avisa; nunca preenche linha com número inventado.
 */
import { TrendingUp } from "lucide-react";
import type { LinhaLadder } from "@/lib/golsLadder";

export type LadderInfo = { lambdaTotal?: number | null; linhas?: LinhaLadder[] | null } | null;

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function LadderGols({ ladder }: { ladder: LadderInfo }) {
  const linhas = ladder?.linhas ?? [];

  if (!linhas.length) {
    return (
      <div className="rounded-2xl border border-line bg-panel p-3.5">
        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-mut">
          <TrendingUp className="h-3.5 w-3.5" /> projeção de gols (over/under)
        </div>
        <p className="mt-1 text-[11px] leading-snug text-mut">
          Sem dados suficientes de gols para projetar as linhas desta partida.
        </p>
      </div>
    );
  }

  const lambda = ladder?.lambdaTotal ?? null;

  return (
    <section className="rounded-2xl border border-line bg-panel p-3.5">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-mut">
            <TrendingUp className="h-3.5 w-3.5" /> projeção de gols (over/under)
          </h3>
          <p className="mt-0.5 text-[10px] text-mut">
            Poisson sobre o total esperado do jogo{lambda != null ? ` (λ ${lambda.toFixed(2)})` : ""} — Over acima de 50%
            é o cenário provável da linha.
          </p>
        </div>
      </header>

      <div className="mt-2 overflow-x-auto rounded-xl border border-line/70">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-line/70 text-[9px] uppercase text-mut">
              <th className="px-2 py-1 text-left font-bold">Linha</th>
              <th className="px-2 py-1 text-right font-bold">Over</th>
              <th className="px-2 py-1 text-right font-bold">Under</th>
              <th className="px-2 py-1 text-right font-bold" title="Odd da casa e odd justa (sem overround) para a linha publicada">
                Odd · justa
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const overForte = l.over > 0.5;
              const underForte = l.under > 0.5;
              return (
                <tr key={l.linha} className="border-b border-line/40 last:border-0">
                  <td className="px-2 py-1 font-extrabold tabular-nums text-ink">
                    {l.linha.toFixed(1).replace(".", ",")}
                  </td>
                  <td className={`whitespace-nowrap px-2 py-1 text-right font-extrabold tabular-nums ${overForte ? "text-acc" : "text-mut"}`}>
                    {pct(l.over)}
                    {overForte && <span className="ml-1 text-[8px] font-black uppercase tracking-wide text-acc/70">▲</span>}
                  </td>
                  <td className={`whitespace-nowrap px-2 py-1 text-right font-extrabold tabular-nums ${underForte ? "text-orange-400" : "text-mut"}`}>
                    {pct(l.under)}
                    {underForte && <span className="ml-1 text-[8px] font-black uppercase tracking-wide text-orange-400/70">▲</span>}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">
                    {l.oddMercado != null ? (
                      <span title={`Lado destacado: ${l.ladoOdd === "over" ? "Over" : "Under"}`}>
                        <b className="text-ink">{l.oddMercado.toFixed(2)}</b>
                        {l.oddJusta != null && <span className="text-mut"> · {l.oddJusta.toFixed(2)}</span>}
                      </span>
                    ) : (
                      <span className="text-mut">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-1.5 text-[8px] leading-snug text-mut">
        Over = P(mais de N gols) · Under = 1 − Over. A coluna de odd só aparece na linha que o mercado publica; a
        &ldquo;justa&rdquo; é a odd sem a comissão da casa (de-vig). Probabilidade não é garantia.
      </p>
    </section>
  );
}
