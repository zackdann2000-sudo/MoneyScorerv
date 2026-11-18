"use client";

import { CalendarClock, TrendingUp } from "lucide-react";
import { useApi } from "./useApi";
import type { Progresso } from "./types";
import { CacheBadge, EmptyBox, ErrorBox, Spinner } from "./Ui";

/**
 * Aba "Desempenho": o histórico público do NerdyTips.
 *
 * É o número que o próprio site publica (acerto geral, bankers, total de jogos)
 * e a tabela mês a mês. Serve para o usuário julgar a fonte antes de confiar no
 * palpite — e deixa claro que nós não calculamos esse acerto.
 */
export default function DesempenhoTab() {
  const { data, loading, error, refresh } = useApi<Progresso>("/api/nerdytips/progresso");

  return (
    <div className="space-y-3">
      {loading && !data && <Spinner label="Buscando histórico…" />}
      {error && <ErrorBox message={error} onRetry={() => refresh()} />}

      {data && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-mut flex items-center gap-1">
              <TrendingUp size={10} className="text-acc" />
              Números publicados pelo NerdyTips
            </p>
            <CacheBadge cache={data.cache} />
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {data.kpis.map((k) => (
              <div key={k.rotulo} className="rounded-xl border border-line bg-panel p-2 space-y-0.5">
                <p className="text-base font-extrabold tabular-nums text-acc leading-none">{k.valor}</p>
                <p className="text-[10px] font-bold text-ink uppercase tracking-wide">{k.rotulo}</p>
                <p className="text-[9px] text-mut leading-tight">{k.sub}</p>
              </div>
            ))}
          </div>

          {data.atualizadoEm && (
            <p className="text-[9px] text-mut flex items-center gap-1">
              <CalendarClock size={9} />
              Registro atualizado em {data.atualizadoEm}
            </p>
          )}

          <section className="rounded-2xl border border-line bg-panel p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-extrabold text-ink uppercase tracking-wide">
                Mês a mês
              </h3>
              <span className="text-[9px] text-mut">
                <span className="text-amber-400 font-bold">Bankers</span> ·{" "}
                <span className="text-acc font-bold">Geral</span>
              </span>
            </div>

            {data.meses.length === 0 && <EmptyBox>O site não publicou a tabela mensal agora.</EmptyBox>}

            <div className="space-y-1">
              {data.meses.map((m) => (
                <div
                  key={m.mes}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-2 text-[10px] py-0.5 border-b border-line/50 last:border-0"
                >
                  <span className="truncate text-ink font-bold">{m.mes}</span>
                  <span className="text-right tabular-nums w-14">
                    <span className="font-extrabold text-amber-400">{m.bankers}</span>
                    <span className="block text-[8px] text-mut truncate">{m.bankersN}</span>
                  </span>
                  <span className="text-right tabular-nums w-16">
                    <span className="font-extrabold text-acc">{m.overall}</span>
                    <span className="block text-[8px] text-mut truncate">{m.overallN}</span>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <p className="text-[9px] text-mut leading-relaxed">
            Acerto passado não garante resultado futuro. Aqui o objetivo é mostrar o histórico que a
            fonte divulga, sem esconder as derrotas.
          </p>
        </>
      )}
    </div>
  );
}
