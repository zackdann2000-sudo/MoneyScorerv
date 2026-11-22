"use client";

/**
 * Bloco "Odds multi-casa" (DumbleScore).
 *
 * Compara, seleção por seleção, o preço de cada casa que cotou o jogo — a
 * ingestão da Sportmonks já grava Pinnacle, Bet365, 1xBet e as demais quando
 * aparecem no payload. A maior odd recebe a tag "Melhor preço" e o bloco
 * calcula o lucro potencial da banca escolhida.
 *
 * Regra da casa: casa que não cotou a seleção não aparece e nada é preenchido
 * por média. Sem odd nenhuma, o bloco avisa em vez de mostrar zero.
 */
import { useMemo, useState } from "react";
import { Crown } from "lucide-react";
import { lucroPotencial, type ComparativoSelecao } from "@/lib/hub/model";

type Props = {
  comparativos: ComparativoSelecao[];
  home: string;
  away: string;
  stakeInicial?: number;
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const ROTULO_MERCADO: Record<string, string> = {
  "1X2": "1X2",
  BTTS: "Ambas marcam",
  "Over/Under": "Gols",
  DoubleChance: "Dupla chance",
};

function rotuloSelecao(selection: string, home: string, away: string): string {
  if (selection === "Home") return home;
  if (selection === "Away") return away;
  if (selection === "Draw") return "Empate";
  if (selection === "Yes") return "Sim";
  if (selection === "No") return "Não";
  return selection;
}

export default function OddsMultiCasa({ comparativos, home, away, stakeInicial = 100 }: Props) {
  const [banca, setBanca] = useState<number>(stakeInicial);
  const [mercado, setMercado] = useState<string | null>(null);

  const mercados = useMemo(() => {
    const ordem: string[] = [];
    for (const c of comparativos) if (!ordem.includes(c.market)) ordem.push(c.market);
    return ordem;
  }, [comparativos]);

  const ativo = mercado ?? mercados[0] ?? null;
  const selecoes = comparativos.filter((c) => c.market === ativo);
  const casasNoMercado = new Set<string>();
  for (const s of selecoes) for (const c of s.casas) casasNoMercado.add(c.slug);

  if (!comparativos.length) {
    return (
      <div className="rounded-xl border border-line bg-panel p-3">
        <p className="py-2 text-center text-[11px] leading-snug text-mut">
          Odds indisponíveis: nenhuma casa cotou este jogo no cache. Sem odd publicada não há comparação de preço — e
          nada é estimado aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-panel p-3">
      {/* banca de referência do lucro potencial */}
      <div className="mb-2 flex items-center gap-2">
        <label htmlFor="banca-odds" className="text-[9px] font-extrabold uppercase tracking-wide text-mut">
          banca
        </label>
        <div className="flex items-center gap-1 rounded-lg border border-line bg-panel2 px-1.5 py-1">
          <span className="text-[10px] font-bold text-mut">R$</span>
          <input
            id="banca-odds"
            type="number"
            min={1}
            step={10}
            inputMode="decimal"
            value={Number.isFinite(banca) ? banca : ""}
            onChange={(e) => setBanca(Math.max(0, Number(e.target.value)))}
            className="w-16 bg-transparent text-[11px] font-bold tabular-nums text-ink outline-none"
          />
        </div>
        <span className="ml-auto text-[9px] font-bold text-mut">
          {casasNoMercado.size} casa{casasNoMercado.size === 1 ? "" : "s"} neste mercado
        </span>
      </div>

      {/* abas de mercado */}
      {mercados.length > 1 && (
        <div className="mb-2 flex gap-1.5 overflow-x-auto no-scrollbar">
          {mercados.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMercado(m)}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-extrabold ${
                m === ativo ? "border-acc bg-acc text-black" : "border-line bg-panel2 text-mut"
              }`}
            >
              {ROTULO_MERCADO[m] ?? m}
            </button>
          ))}
        </div>
      )}

      <ul className="space-y-2">
        {selecoes.map((s) => {
          const melhor = s.melhor;
          const lucro = melhor ? lucroPotencial(banca, melhor.odd) : null;
          return (
            <li key={`${s.market}-${s.selection}`} className="rounded-lg border border-line bg-panel2 p-2">
              <div className="flex items-baseline gap-1.5">
                <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-ink">
                  {rotuloSelecao(s.selection, home, away)}
                </span>
                {s.vantagemPct != null && s.vantagemPct > 0 && (
                  <span className="shrink-0 text-[9px] font-bold text-mut tabular-nums">+{s.vantagemPct.toFixed(1)}% vs pior</span>
                )}
              </div>

              <div className="mt-1.5 flex gap-1.5 overflow-x-auto no-scrollbar">
                {s.casas.map((c) => {
                  const best = melhor != null && c.odd === melhor.odd && c.slug === melhor.slug;
                  return (
                    <div
                      key={`${s.market}-${s.selection}-${c.slug}`}
                      className={`shrink-0 rounded-lg border px-2 py-1 text-center ${
                        best ? "border-acc bg-acc/15" : "border-line bg-panel"
                      }`}
                    >
                      <p className={`text-[8px] font-extrabold uppercase tracking-wide ${best ? "text-acc" : "text-mut"}`}>
                        {c.casa}
                      </p>
                      <p className={`font-display text-[13px] font-bold leading-tight tabular-nums ${best ? "text-acc" : "text-ink"}`}>
                        {c.odd.toFixed(2)}
                      </p>
                    </div>
                  );
                })}
                {s.totalCasas > s.casas.length && (
                  <span className="shrink-0 self-center text-[9px] font-bold text-mut">+{s.totalCasas - s.casas.length} casas</span>
                )}
              </div>

              {melhor && lucro && (
                <div className="mt-1.5 flex items-center gap-1.5 border-t border-line pt-1.5">
                  <Crown size={11} className="shrink-0 text-acc" />
                  <span className="shrink-0 rounded-full border border-acc/50 bg-acc/15 px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wide text-acc">
                    melhor preço
                  </span>
                  <span className="min-w-0 truncate text-[10px] font-bold text-ink">
                    {melhor.casa} @{melhor.odd.toFixed(2)}
                  </span>
                  <span className="ml-auto shrink-0 text-[10px] font-bold text-acc tabular-nums">
                    lucro {BRL.format(lucro.lucro)}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-2 border-t border-line pt-1.5 text-[9px] leading-snug text-mut">
        &quot;Melhor preço&quot; é a maior odd entre as casas que cotaram a seleção (até 6 por mercado). Lucro potencial =
        banca × (odd − 1), sem imposto nem cash-out. Odds mudam até o apito — confirme na casa antes de apostar.
      </p>
    </div>
  );
}
