"use client";
import { useEffect, useMemo, useState } from "react";
import { Crest } from "@/components/ui";
import {
  FILTROS,
  filtrar,
  buscar,
  comMedias,
  type FiltroId,
  type TeamStatMetric,
} from "@/lib/teamStatCats";

type Team = { id: string; name: string; logo: string };

/* =======================================================================
   BARRA DUPLA — [Valor A] [Métrica] [Valor B] + proporção
   Mandante em verde de destaque; visitante em cinza escuro.
   ======================================================================= */
function StatBar({
  metric,
  homeColor,
  awayColor,
}: {
  metric: TeamStatMetric;
  homeColor: string;
  awayColor: string;
}) {
  const { home, away, label, percent } = metric;
  const total = home + away;
  /* Sem nenhum valor: barra neutra, sem inventar proporção. */
  const pHome = total > 0 ? (home / total) * 100 : 50;
  const pAway = 100 - pHome;

  const fmt = (v: number) =>
    percent ? `${Math.round(v)}%` : Number.isInteger(v) ? String(v) : v.toFixed(2);

  /* Marca em negrito o lado que lidera a métrica. */
  const homeLead = home > away;
  const awayLead = away > home;

  return (
    <div className="py-2">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`font-display font-bold text-sm tabular-nums w-12 text-left ${
            homeLead ? "text-acc" : "text-ink/70"
          }`}
        >
          {fmt(home)}
        </span>
        <span className="text-[10px] font-bold text-mut uppercase tracking-wide text-center flex-1 truncate">
          {label}
        </span>
        <span
          className={`font-display font-bold text-sm tabular-nums w-12 text-right ${
            awayLead ? "text-ink" : "text-ink/60"
          }`}
        >
          {fmt(away)}
        </span>
      </div>
      <div className="flex gap-1 mt-1 h-1.5">
        <div className="flex-1 rounded-full overflow-hidden bg-panel2">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pHome}%`, background: homeColor }}
          />
        </div>
        <div className="flex-1 rounded-full overflow-hidden bg-panel2">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pAway}%`, background: awayColor }}
          />
        </div>
      </div>
    </div>
  );
}

/* =======================================================================
   ABA ESTATÍSTICAS COMPARATIVAS DO TIME
   ======================================================================= */
export default function TeamStatsTab({
  matchId,
  league,
  home,
  away,
}: {
  matchId: string;
  league: string;
  home: Team;
  away: Team;
}) {
  const [data, setData] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tempo, setTempo] = useState<"total" | "1t" | "2t">("total");
  const [modo, setModo] = useState<"total" | "medias">("total");
  const [filtro, setFiltro] = useState<FiltroId>("principais");
  const [busca, setBusca] = useState("");

  useEffect(() => {
    let on = true;
    fetch(`/api/matches/${matchId}/team-stats?league=${league}`)
      .then((r) => r.json())
      .then((j) => on && setData(j))
      .catch(() => on && setErro("Não foi possível carregar as estatísticas agora."));
    return () => {
      on = false;
    };
  }, [matchId, league]);

  const metricas: TeamStatMetric[] = useMemo(() => {
    const base: TeamStatMetric[] = data?.metrics || [];
    const comMedia = modo === "medias" ? comMedias(base, data?.sample || 0) : base;
    return buscar(filtrar(comMedia, filtro), busca);
  }, [data, filtro, busca, modo]);

  const loading = !data && !erro;

  if (erro) {
    return <p className="text-xs text-mut text-center py-8">{erro}</p>;
  }

  return (
    <div className="space-y-3">
      {/* Cabeçalho dos times */}
      <div className="bg-panel border border-line rounded-2xl p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="flex items-center gap-1.5 min-w-0">
            <Crest src={home.logo} size={22} />
            <span className="text-[11px] font-bold text-acc truncate">{home.name}</span>
          </span>
          <span className="text-[9px] font-extrabold text-mut uppercase shrink-0">Comparativo</span>
          <span className="flex items-center gap-1.5 min-w-0 justify-end">
            <span className="text-[11px] font-bold text-mut truncate">{away.name}</span>
            <Crest src={away.logo} size={22} />
          </span>
        </div>

        {/* Toggles de tempo: 1º/2º travados (plano Free não entrega split) */}
        <div className="flex gap-1.5">
          <button
            onClick={() => setTempo("total")}
            className={`flex-1 px-2 py-1.5 rounded-full text-[10px] font-extrabold border ${
              tempo === "total" ? "bg-acc text-black border-acc" : "bg-panel2 border-line text-mut"
            }`}
          >
            Total
          </button>
          {(["1t", "2t"] as const).map((t) => (
            <button
              key={t}
              disabled
              title="Disponível no plano pago"
              className="flex-1 px-2 py-1.5 rounded-full text-[10px] font-extrabold border border-line bg-panel2 text-mut/50 cursor-not-allowed flex items-center justify-center gap-1"
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              {t === "1t" ? "1º tempo" : "2º tempo"}
            </button>
          ))}
        </div>

        {/* Total / Médias — "Médias" travado até termos a amostra real de jogos;
            deixá-lo clicável devolveria os mesmos números de "Total". */}
        <div className="flex gap-1.5 mt-1.5">
          <button
            onClick={() => setModo("total")}
            className={`flex-1 px-2 py-1.5 rounded-full text-[10px] font-extrabold border ${
              modo === "total" ? "bg-panel2 border-acc text-acc" : "bg-panel2 border-line text-mut"
            }`}
          >
            Total
          </button>
          <button
            disabled
            title="Disponível em breve"
            className="flex-1 px-2 py-1.5 rounded-full text-[10px] font-extrabold border border-line bg-panel2 text-mut/50 cursor-not-allowed flex items-center justify-center gap-1"
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Médias
          </button>
        </div>
      </div>

      {/* Busca */}
      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar métrica (ex.: xG, posse, escanteios)"
        className="w-full bg-panel border border-line rounded-xl px-3 py-2 text-[12px] text-ink placeholder:text-mut/60 focus:outline-none focus:border-acc"
      />

      {/* Filtros em pílula */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltro(f.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors ${
              filtro === f.id ? "bg-acc text-black border-acc" : "bg-panel border-line text-mut"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {loading && (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-12 rounded-xl" />
          ))}
          <p className="text-[10px] text-mut text-center">Buscando as estatísticas da partida…</p>
        </div>
      )}

      {data?.pendente && (
        <div className="bg-panel border border-line rounded-2xl px-4 py-8 flex flex-col items-center text-center gap-2">
          <span className="text-2xl" aria-hidden>
            ⏱️
          </span>
          <p className="text-[12px] font-bold text-ink">
            {data.mensagem || "As estatísticas aparecem assim que a bola rolar."}
          </p>
        </div>
      )}

      {!loading && !data?.pendente && metricas.length === 0 && (
        <p className="text-xs text-mut text-center py-6">
          {busca
            ? `Nenhuma métrica encontrada para "${busca}".`
            : "Nenhuma métrica disponível neste filtro."}
        </p>
      )}

      {metricas.length > 0 && (
        <div className="bg-panel border border-line rounded-2xl px-3 py-1 divide-y divide-line/60">
          {metricas.map((m) => (
            <StatBar key={m.key} metric={m} homeColor="var(--acc)" awayColor="#4a5a66" />
          ))}
        </div>
      )}

      {data?.source && (
        <p className="text-[9px] text-mut/70 text-center">
          Fonte: {data.source}
          {modo === "medias" && data?.sample ? ` · média sobre ${data.sample} jogos` : ""}
          {data.cache === "hit" ? " · do cache" : ""}
        </p>
      )}
    </div>
  );
}
