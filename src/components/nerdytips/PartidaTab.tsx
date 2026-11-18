"use client";

import { ArrowLeft, Sparkles, Target } from "lucide-react";
import H2HPalpiteCard from "@/components/H2HPalpiteCard";
import { useApi } from "./useApi";
import type { Partida } from "./types";
import { CacheBadge, ConfBar, EmptyBox, ErrorBox, Odd, Spinner } from "./Ui";

function quando(ts: number | null): string {
  if (!ts) return "";
  try {
    return new Date(ts * 1000).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/**
 * Detalhe de um jogo (equivalente a /match-details do site).
 *
 * Mostra os palpites de cada mercado com a confiança, o "predito x real" das
 * estatísticas (xG, posse, finalizações…) e o resumo do H2H.
 */
export default function PartidaTab({ id, onVoltar }: { id: string; onVoltar: () => void }) {
  const { data, loading, error, refresh } = useApi<Partida>(`/api/nerdytips/partida/${id}`);

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onVoltar}
        className="inline-flex items-center gap-1 h-8 px-2 rounded-xl border border-line bg-panel text-[11px] font-bold text-ink"
      >
        <ArrowLeft size={13} /> Palpites
      </button>

      {loading && !data && <Spinner label="Carregando análise…" />}
      {error && <ErrorBox message={error} onRetry={() => refresh()} />}

      {data && (
        <>
          {/* Cabeçalho */}
          <div className="rounded-2xl border border-line bg-panel p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold text-mut uppercase tracking-wide truncate">
                {data.liga}
              </span>
              <CacheBadge cache={data.cache} />
            </div>

            <div className="flex items-center gap-2">
              <span className="flex-1 min-w-0 truncate text-sm font-extrabold text-ink text-right">
                {data.casa}
              </span>
              <span className="shrink-0 px-1 text-lg font-extrabold tabular-nums text-ink">
                {data.placar ? `${data.placar.casa} : ${data.placar.fora}` : "– : –"}
              </span>
              <span className="flex-1 min-w-0 truncate text-sm font-extrabold text-ink">{data.fora}</span>
            </div>

            <div className="flex items-center justify-between gap-2 text-[10px] text-mut">
              <span>{quando(data.kickoffTs)}</span>
              <span className="font-bold uppercase tracking-wide">{data.status}</span>
            </div>

            <div className="flex items-center gap-3 text-[10px] text-mut pt-1 border-t border-line">
              <span className="flex items-center gap-1">
                1 <Odd valor={data.odds.casa} destaque />
              </span>
              <span className="flex items-center gap-1">
                X <Odd valor={data.odds.empate} />
              </span>
              <span className="flex items-center gap-1">
                2 <Odd valor={data.odds.fora} />
              </span>
              {data.h2h && (
                <span className="ml-auto text-[9px]">
                  H2H {data.h2h.vitoriasCasa}-{data.h2h.empates}-{data.h2h.vitoriasFora}
                </span>
              )}
            </div>
          </div>

          {/* Palpite fixo do H2H: em destaque, logo abaixo do cabeçalho.
              O card se esconde sozinho quando há menos de 3 confrontos. */}
          <H2HPalpiteCard jogos={data.h2hJogos ?? []} />

          {/* Melhor palpite */}
          {data.melhor && (
            <div className="rounded-2xl border border-acc/30 bg-acc/5 p-3 space-y-1.5">
              <div className="flex items-center gap-1 text-[10px] font-extrabold text-acc uppercase tracking-wide">
                <Sparkles size={11} /> Melhor palpite
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-base font-extrabold text-ink">{data.melhor.texto || data.melhor.pick}</span>
                {data.melhor.odd != null && (
                  <span className="text-sm font-extrabold tabular-nums text-acc">
                    {data.melhor.odd.toFixed(2)}
                  </span>
                )}
              </div>
              <ConfBar valor={data.melhor.confianca} />
              <p className="text-[9px] text-mut leading-none">
                palpite e confiança do modelo da fonte NerdyTips
              </p>
            </div>
          )}

          {/* Cards de mercado */}
          {data.palpites.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {data.palpites.map((p) => (
                <div key={p.rotulo} className="rounded-xl border border-line bg-panel p-2 space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[9px] font-bold text-mut uppercase tracking-wide truncate">
                      {p.rotulo}
                    </span>
                    {p.odd != null && (
                      <span className="text-[10px] font-extrabold tabular-nums text-ink">
                        {p.odd.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] font-bold text-ink truncate">{p.texto || p.pick || "—"}</p>
                  {p.confianca != null && <ConfBar valor={p.confianca} />}
                </div>
              ))}
            </div>
          )}

          {/* Predito x real */}
          {data.stats.length > 0 && (
            <section className="rounded-2xl border border-line bg-panel p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-extrabold text-ink uppercase tracking-wide flex items-center gap-1">
                  <Target size={11} className="text-acc" /> Modelo × jogo
                </h3>
                <span className="text-[9px] text-mut">xG, posse, finalizações…</span>
              </div>

              <div className="space-y-1">
                {data.stats.map((s) => (
                  <div key={s.rotulo} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[10px]">
                    <div className="text-right tabular-nums">
                      <span className="font-extrabold text-ink">{s.predCasa}</span>
                      {s.realCasa != null && <span className="text-mut"> / {s.realCasa}</span>}
                    </div>
                    <div className="text-center text-[9px] text-mut max-w-[110px] truncate">{s.rotulo}</div>
                    <div className="tabular-nums">
                      <span className="font-extrabold text-ink">{s.predFora}</span>
                      {s.realFora != null && <span className="text-mut"> / {s.realFora}</span>}
                    </div>
                  </div>
                ))}
              </div>
              {data.encerrado && (
                <p className="text-[9px] text-mut">Modelo (primeiro valor) e o que aconteceu no jogo.</p>
              )}
            </section>
          )}

          {/* Gols */}
          {data.eventos.length > 0 && (
            <section className="rounded-2xl border border-line bg-panel p-3 space-y-1.5">
              <h3 className="text-[11px] font-extrabold text-ink uppercase tracking-wide">Momentos</h3>
              {data.eventos.map((e, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px]">
                  <span className="w-8 shrink-0 text-mut tabular-nums">{e.minuto}</span>
                  <span className="flex-1 min-w-0 truncate text-ink">{e.texto}</span>
                  {e.placar && <span className="shrink-0 font-extrabold tabular-nums text-ink">{e.placar}</span>}
                </div>
              ))}
            </section>
          )}

          {data.palpites.length === 0 && data.stats.length === 0 && (
            <EmptyBox>O site não publicou análise completa para este jogo.</EmptyBox>
          )}
        </>
      )}
    </div>
  );
}
