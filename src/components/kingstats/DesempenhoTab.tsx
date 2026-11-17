"use client";

import { useMemo } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { useApi } from "./useApi";
import type { ResumoResp } from "./types";
import { Spinner, ErrorBox, EmptyBox } from "./Ui";

/** Sparkline simples em SVG da série de unidades (sem dependências). */
function Serie({ pontos }: { pontos: number[] }) {
  if (pontos.length < 2) return null;
  const w = 320;
  const h = 88;
  const min = Math.min(...pontos, 0);
  const max = Math.max(...pontos, 0);
  const span = max - min || 1;
  const x = (i: number) => (i / (pontos.length - 1)) * w;
  const y = (v: number) => h - ((v - min) / span) * (h - 8) - 4;
  const linha = pontos.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${linha} L${w},${h} L0,${h} Z`;
  const zeroY = y(0);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[88px]" preserveAspectRatio="none">
      <defs>
        <linearGradient id="gAcc" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-acc)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--color-acc)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* linha do zero */}
      <line x1="0" y1={zeroY} x2={w} y2={zeroY} stroke="var(--color-line)" strokeWidth="1" strokeDasharray="3 3" />
      <path d={area} fill="url(#gAcc)" />
      <path d={linha} fill="none" stroke="var(--color-acc)" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export default function DesempenhoTab() {
  const { data, loading, error, refresh } = useApi<ResumoResp>("/api/kingstats/resumo", []);

  const ultimos = useMemo(() => data?.ultimosResultados?.items ?? [], [data]);
  const meses = useMemo(() => (data?.meses ?? []).slice().reverse(), [data]);

  if (loading && !data) return <Spinner label="Carregando desempenho…" />;
  if (error) return <ErrorBox message={error} onRetry={() => refresh()} />;
  if (!data) return null;

  const d = data.desempenho;
  const positivas = (d.greens ?? 0) + (d.reds ?? 0) > 0;
  const acerto = positivas ? (d.greens / (d.greens + d.reds)) * 100 : 0;
  const lucro = d.units >= 0;

  return (
    <div className="space-y-3">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-line bg-panel p-3">
          <p className="text-[10px] text-mut">Unidades</p>
          <p className={`text-2xl font-extrabold tabular-nums ${lucro ? "text-acc" : "text-danger"}`}>
            {d.units >= 0 ? "+" : ""}
            {d.units.toFixed(2)}
          </p>
          <p className="inline-flex items-center gap-1 text-[9px] text-mut">
            {lucro ? <TrendingUp size={10} /> : <TrendingDown size={10} />} desde o início
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-panel p-3">
          <p className="text-[10px] text-mut">Acerto</p>
          <p className="text-2xl font-extrabold tabular-nums text-ink">{acerto.toFixed(1)}%</p>
          <p className="text-[9px] text-mut tabular-nums">
            {d.greens}G · {d.reds}R · {d.voids}V
          </p>
        </div>
      </div>

      {/* Série */}
      <div className="rounded-2xl border border-line bg-panel p-3">
        <p className="text-[10px] text-mut mb-1">Evolução das unidades</p>
        <Serie pontos={d.chart ?? []} />
      </div>

      {/* Meses */}
      {meses.length > 0 && (
        <div className="rounded-2xl border border-line bg-panel p-3 space-y-1.5">
          <p className="text-[10px] text-mut">Por mês</p>
          {meses.map((m) => (
            <div key={m.month} className="flex items-center justify-between text-[11px]">
              <span className="text-mut tabular-nums">{m.month}</span>
              <span className={`font-extrabold tabular-nums ${m.units >= 0 ? "text-acc" : "text-danger"}`}>
                {m.units >= 0 ? "+" : ""}
                {m.units.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Últimos resultados */}
      <div className="space-y-1.5">
        <p className="text-[10px] text-mut">
          Últimos resultados {data.ultimosResultados?.day ? `· ${data.ultimosResultados.day}` : ""}
        </p>
        {ultimos.length === 0 ? (
          <EmptyBox>Sem resultados recentes.</EmptyBox>
        ) : (
          <ul className="space-y-1">
            {ultimos.map((r) => (
              <li
                key={r.id}
                className="rounded-xl border border-line bg-panel p-2 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-ink truncate">
                    {r.mandante} <span className="text-mut">×</span> {r.visitante}
                  </p>
                  <p className="text-[9px] text-mut truncate">
                    {r.mercado} · odd {r.odd.toFixed(2)}
                  </p>
                </div>
                <span
                  className={`shrink-0 px-2 h-6 rounded-lg text-[9px] font-extrabold inline-flex items-center ${
                    r.status === "green"
                      ? "bg-acc/20 text-acc"
                      : r.status === "red"
                        ? "bg-danger/20 text-danger"
                        : "bg-panel2 text-mut"
                  }`}
                >
                  {r.status === "green" ? "GREEN" : r.status === "red" ? "RED" : "VOID"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[9px] text-mut text-center">
        Estatísticas do painel público do The King STATS
        {data.atualizadoEm
          ? ` · ${new Date(data.atualizadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
          : ""}
      </p>
    </div>
  );
}
