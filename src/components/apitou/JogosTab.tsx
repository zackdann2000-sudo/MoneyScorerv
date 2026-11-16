"use client";

import { useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { useApi } from "./useApi";
import type { JogosResp, JogoLista } from "./types";
import { ErrorBox, EmptyBox, Spinner, FonteBadge, horaJogo, diaCurto } from "./Ui";

/**
 * Aba "Jogos do Dia" — lista por dia com o resumo de cada partida.
 *
 * Consome GET /api/apitou/jogos?date=YYYY-MM-DD. A rota devolve também a lista
 * de dias disponíveis; usamos isso para navegar entre datas sem chamada extra.
 */
export default function JogosTab({
  date,
  onAbrirJogo,
}: {
  date: string;
  onAbrirJogo: (id: number) => void;
}) {
  const url = useMemo(() => `/api/apitou/jogos${date ? `?date=${date}` : ""}`, [date]);
  const { data, loading, error, refresh } = useApi<JogosResp>(url, [date]);
  const [diaSel, setDiaSel] = useState<string | null>(null);

  // Dias disponíveis vêm da rota; quando selecionamos um, filtramos localmente
  // (a rota já filtra, mas para trocar de dia sem nova chamada trabalhamos aqui).
  const dias = data?.dias ?? [];
  const diaAtivo = diaSel ?? date;

  const jogosDoDia = useMemo(() => {
    if (!data) return [] as JogoLista[];
    return data.jogos.filter((j) => j.dia === (diaAtivo || date));
  }, [data, diaAtivo, date]);

  if (loading && !data) return <Spinner label="Carregando jogos…" />;
  if (error) return <ErrorBox message={error} onRetry={() => refresh()} />;
  if (!data) return null;

  const totalDia = jogosDoDia.length;

  return (
    <div className="space-y-3">
      {/* Seletor de dia horizontal */}
      {dias.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {dias.map((d) => (
            <button
              key={d}
              onClick={() => setDiaSel(d === date ? null : d)}
              className={`shrink-0 px-3 h-8 rounded-xl border text-[11px] font-bold transition-colors ${
                diaAtivo === d ? "bg-acc text-bg border-acc" : "bg-panel border-line text-ink"
              }`}
            >
              {diaCurto(d)}
            </button>
          ))}
        </div>
      )}

      <p className="text-xs text-mut">
        <span className="text-acc font-extrabold">{totalDia}</span> {totalDia === 1 ? "jogo" : "jogos"}
        {date ? ` · ${diaCurto(date)}` : ""}
      </p>

      {totalDia === 0 ? (
        <EmptyBox>Nenhum jogo neste dia. O site só cobre a semana corrente.</EmptyBox>
      ) : (
        <ul className="space-y-2">
          {jogosDoDia.map((j) => (
            <li key={j.id}>
              <button
                onClick={() => onAbrirJogo(j.id)}
                className="w-full text-left rounded-2xl border border-line bg-panel hover:border-acc/60 transition-colors p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold text-mut uppercase tracking-wide truncate">
                    {j.competicao}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-acc tabular-nums">
                    <CalendarDays size={11} /> {horaJogo(j.kickoff)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex-1 truncate font-bold text-ink">{j.home}</span>
                  <span className="text-[10px] text-mut shrink-0">×</span>
                  <span className="flex-1 truncate font-bold text-ink text-right">{j.away}</span>
                </div>

                {/* Metadados compactos: quantas props e mercados */}
                <div className="flex items-center justify-between gap-2 text-[10px] text-mut">
                  <span className="inline-flex gap-2">
                    {j.jogadores > 0 && <span>{j.jogadores} props</span>}
                    {j.mercados > 0 && <span>{j.mercados} mercados</span>}
                  </span>
                  <span className="truncate max-w-[55%] text-right">{j.arbitro ?? ""}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <FonteBadge geradoEm={data.geradoEm} stale={data.stale} />
    </div>
  );
}