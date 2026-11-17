"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Search, Filter } from "lucide-react";
import { useApi } from "./useApi";
import type { JogosResp } from "./types";
import { Spinner, ErrorBox, EmptyBox, FonteBadge, horaJogo } from "./Ui";

const PAGINA = 40;

/**
 * Aba "Jogos" — lista do dia com busca por time e filtro por liga.
 *
 * São ~700 jogos por dia, então paginamos no cliente (40 por vez) em vez de
 * renderizar tudo. Filtros aplicados antes da paginação.
 */
export default function JogosTab({
  date,
  onAbrirJogo,
}: {
  date: string;
  onAbrirJogo: (id: string) => void;
}) {
  const { data, loading, error, refresh } = useApi<JogosResp>(
    `/api/kingstats/jogos${date ? `?date=${date}` : ""}`,
    [date],
  );

  const [busca, setBusca] = useState("");
  const [liga, setLiga] = useState("");
  const [limite, setLimite] = useState(PAGINA);

  const lista = useMemo(() => data?.jogos ?? [], [data]);

  const ligas = useMemo(
    () => [...new Set(lista.filter((j) => !j.esoccer).map((j) => j.liga))].sort(),
    [lista],
  );

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return lista.filter((j) => {
      if (j.esoccer) return false;
      if (liga && j.liga !== liga) return false;
      if (!q) return true;
      return j.home.toLowerCase().includes(q) || j.away.toLowerCase().includes(q);
    });
  }, [lista, busca, liga]);

  if (loading && !data) return <Spinner label="Carregando jogos…" />;
  if (error) return <ErrorBox message={error} onRetry={() => refresh()} />;
  if (!data) return null;

  const visiveis = filtrados.slice(0, limite);

  return (
    <div className="space-y-3">
      {/* Busca */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-mut" />
        <input
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setLimite(PAGINA);
          }}
          placeholder="Buscar time…"
          className="w-full h-9 pl-9 pr-3 rounded-xl bg-panel border border-line text-xs text-ink placeholder:text-mut outline-none focus:border-acc/60"
        />
      </div>

      {/* Filtro de liga */}
      {ligas.length > 1 && (
        <div className="relative">
          <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-mut" />
          <select
            value={liga}
            onChange={(e) => {
              setLiga(e.target.value);
              setLimite(PAGINA);
            }}
            className="w-full h-9 pl-9 pr-3 rounded-xl bg-panel border border-line text-xs text-ink outline-none appearance-none"
          >
            <option value="">Todas as ligas ({ligas.length})</option>
            {ligas.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
      )}

      <p className="text-xs text-mut">
        <span className="text-acc font-extrabold">{filtrados.length}</span>{" "}
        {filtrados.length === 1 ? "jogo" : "jogos"} · {data.dia}
      </p>

      {filtrados.length === 0 ? (
        <EmptyBox>
          {data.total === 0
            ? "A fonte não tem jogos para este dia."
            : "Nenhum jogo bate com a busca/filtro."}
        </EmptyBox>
      ) : (
        <ul className="space-y-1.5">
          {visiveis.map((j) => (
            <li key={j.id}>
              <button
                onClick={() => onAbrirJogo(j.id)}
                className="w-full text-left rounded-2xl border border-line bg-panel hover:border-acc/60 transition-colors p-2.5 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9px] font-bold text-mut uppercase tracking-wide truncate">
                    {j.liga}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-acc tabular-nums shrink-0">
                    <CalendarDays size={10} /> {horaJogo(j.kickoff)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="flex-1 truncate font-bold text-ink">{j.home}</span>
                  <span className="text-[9px] text-mut shrink-0">×</span>
                  <span className="flex-1 truncate font-bold text-ink text-right">{j.away}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {filtrados.length > limite && (
        <button
          onClick={() => setLimite((l) => l + PAGINA)}
          className="w-full h-9 rounded-xl border border-line text-[11px] font-bold text-ink"
        >
          Mostrar mais ({filtrados.length - limite} restantes)
        </button>
      )}

      <FonteBadge geradoEm={data.geradoEm} />
    </div>
  );
}
