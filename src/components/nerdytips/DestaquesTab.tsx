"use client";

import { Layers, Sparkles, Ticket } from "lucide-react";
import { useApi } from "./useApi";
import type { Destaques, Jogo } from "./types";
import { CacheBadge, ConfBar, EmptyBox, ErrorBox, Odd, ResultadoPill, Spinner } from "./Ui";

/** Bancada do topo: os contadores que o site mostra acima do board. */
function Contador({ valor, rotulo, cor }: { valor: string; rotulo: string; cor: string }) {
  return (
    <div className="flex-1 rounded-xl border border-line bg-panel p-2 text-center">
      <p className={`text-base font-extrabold tabular-nums ${cor}`}>{valor}</p>
      <p className="text-[9px] text-mut uppercase tracking-wide">{rotulo}</p>
    </div>
  );
}

function LinhaBanker({ j, onAbrir }: { j: Jogo; onAbrir: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onAbrir(j.id)}
      className="w-full text-left rounded-xl border border-line bg-panel p-2 space-y-1 active:bg-panel/70"
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-bold text-mut tabular-nums shrink-0">{j.hora}</span>
        <span className="flex-1 min-w-0 truncate text-[11px] font-bold text-ink">
          {j.casa} × {j.fora}
        </span>
        <ResultadoPill status={j.status} />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {j.melhor && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-acc">
            <Sparkles size={9} />
            {j.melhor.texto}
            {j.melhor.odd != null && <b className="tabular-nums">{j.melhor.odd.toFixed(2)}</b>}
          </span>
        )}
        <ConfBar valor={j.melhor?.confianca ?? null} />
        <span className="ml-auto text-[9px] text-mut truncate max-w-[45%]">{j.liga}</span>
      </div>
    </button>
  );
}

/**
 * Aba "Destaques": Bet of the Day + Slip do dia.
 *
 * Bankers são os jogos com confiança alta (>= 9/10). Ordenamos por confiança
 * para o "melhor do dia" aparecer primeiro.
 */
export default function DestaquesTab({ onAbrirJogo }: { onAbrirJogo: (id: string) => void }) {
  const { data, loading, error, refresh } = useApi<Destaques>("/api/nerdytips/destaques");

  const bankers = [...(data?.jogos ?? [])]
    .filter((j) => (j.melhor?.confianca ?? 0) >= 9)
    .sort((a, b) => (b.melhor?.confianca ?? 0) - (a.melhor?.confianca ?? 0));

  const outros = (data?.jogos ?? []).filter((j) => (j.melhor?.confianca ?? 0) < 9);

  return (
    <div className="space-y-3">
      {loading && !data && <Spinner label="Buscando destaques…" />}
      {error && <ErrorBox message={error} onRetry={() => refresh()} />}

      {data && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-mut">Seleção do dia do NerdyTips</p>
            <CacheBadge cache={data.cache} />
          </div>

          <div className="flex gap-1.5">
            <Contador valor={String(data.bankers ?? bankers.length)} rotulo="Bankers" cor="text-acc" />
            <Contador valor={String(data.proximos ?? 0)} rotulo="A começar" cor="text-ink" />
            <Contador valor={data.acerto ?? "—"} rotulo="Acerto" cor="text-emerald-400" />
          </div>

          {/* Slip do dia */}
          {data.slip && (
            <div className="rounded-2xl border border-acc/30 bg-acc/5 p-3 space-y-1">
              <div className="flex items-center gap-1 text-[10px] font-extrabold text-acc uppercase tracking-wide">
                <Ticket size={11} /> Slip do dia
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] text-ink">
                  {data.slip.picks ?? "—"} seleções combinadas
                </span>
                <span className="text-sm font-extrabold tabular-nums text-acc">
                  {data.slip.odd != null ? data.slip.odd.toFixed(2) : "—"}
                </span>
              </div>
              <p className="text-[9px] text-mut">
                Odd total publicada pelo site. O slip completo exige assinatura lá — aqui mostramos
                só o resumo.
              </p>
            </div>
          )}

          <section className="space-y-1.5">
            <h3 className="text-[10px] font-extrabold text-mut uppercase tracking-wide px-1 flex items-center gap-1">
              <Layers size={10} /> Bankers (confiança 9+)
            </h3>
            {bankers.length === 0 && <EmptyBox>Nenhum jogo com confiança 9+ neste momento.</EmptyBox>}
            {bankers.map((j) => (
              <LinhaBanker key={j.id} j={j} onAbrir={onAbrirJogo} />
            ))}
          </section>

          {outros.length > 0 && (
            <section className="space-y-1.5">
              <h3 className="text-[10px] font-extrabold text-mut uppercase tracking-wide px-1">
                Também no dia ({outros.length})
              </h3>
              {outros.slice(0, 12).map((j) => (
                <LinhaBanker key={j.id} j={j} onAbrir={onAbrirJogo} />
              ))}
            </section>
          )}

          <p className="text-[9px] text-mut leading-relaxed">
            Os palpites são do NerdyTips. Nosso módulo só organiza e traduz o que o site publica —
            não gera nem altera previsão.
          </p>
        </>
      )}
    </div>
  );
}
