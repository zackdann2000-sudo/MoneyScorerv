"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { useApi } from "./useApi";
import { ErrorBox, Spinner } from "./Ui";
import type { CacheInfo } from "./types";

type Pair = { for: number | null; against: number | null };

type HistoryResp = {
  teamId: string;
  count: number;
  available: string[];
  games: {
    fixtureId: string;
    date: string | null;
    result: string | null;
    isHome: boolean;
    opponentName: string;
    opponentLogo: string;
    metrics: Record<string, Pair | null>;
  }[];
  cache: CacheInfo;
};

/** Nome legível para cada métrica da API. */
const LABELS: Record<string, string> = {
  goals: "Gols",
  shotsTotal: "Finalizações",
  shotsOnTarget: "No alvo",
  expectedGoals: "xG",
  cornerKicks: "Cantos",
  ballPossession: "Posse (%)",
  fouls: "Faltas",
  yellowCards: "Cartões amarelos",
  totalPasses: "Passes",
  tackles: "Desarmes",
  goalkeeperSaves: "Defesas do GK",
  offsides: "Impedimentos",
};

const RESULT_COLOR: Record<string, string> = {
  W: "var(--acc)",
  D: "var(--mut)",
  L: "var(--danger)",
};

/**
 * Gráfico de barras dos últimos N jogos de um time.
 *
 * Mostra a métrica escolhida como barra (a favor) e uma barra tracejada do que
 * o time sofreu, com uma linha de referência na média. A cor de cada barra segue
 * o resultado da partida (verde/empate/vermelho), o que dá leitura imediata.
 */
export default function TeamHistoryChart({
  teamId,
  teamName,
  lastN = 10,
}: {
  teamId: string;
  teamName: string;
  lastN?: number;
}) {
  const [metric, setMetric] = useState<string>("goals");
  const [showAgainst, setShowAgainst] = useState(false);

  const { data, loading, error, refresh } = useApi<HistoryResp>(
    `/api/gameread/teams/${teamId}/history?lastN=${lastN}`,
  );

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.games.map((g) => {
      const m = g.metrics[metric];
      return {
        // Rótulo curto do eixo: "3 letras do adversário" + mando.
        name: `${g.opponentName.slice(0, 3).toUpperCase()}${g.isHome ? "" : " ✈"}`,
        favor: m?.for ?? 0,
        contra: m?.against ?? 0,
        result: g.result ?? "",
        opponent: g.opponentName,
        date: g.date,
        full: g,
      };
    });
  }, [data, metric]);

  const avg = useMemo(() => {
    if (chartData.length === 0) return 0;
    const sum = chartData.reduce((a, b) => a + b.favor, 0);
    return Math.round((sum / chartData.length) * 100) / 100;
  }, [chartData]);

  if (loading && !data) return <Spinner label="Montando histórico..." />;
  if (error) return <ErrorBox message={error} onRetry={() => refresh()} />;
  if (!data) return null;

  const options = data.available.filter((k) => LABELS[k]);
  if (options.length === 0 || chartData.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-panel p-4 text-center text-[11px] text-mut">
        Histórico de jogos ainda não disponível para {teamName}.
      </div>
    );
  }

  const current = options.includes(metric) ? metric : options[0];

  return (
    <section className="rounded-2xl border border-line bg-panel overflow-hidden">
      <header className="px-3 py-2 border-b border-line bg-panel2 flex items-center gap-2 flex-wrap">
        <TrendingUp size={13} className="text-acc shrink-0" />
        <h4 className="text-[11px] font-extrabold text-ink truncate">
          Últimos {lastN} jogos · {teamName}
        </h4>
        <button
          onClick={() => setShowAgainst((v) => !v)}
          className={`ml-auto shrink-0 px-2 h-6 rounded-lg border text-[9px] font-bold ${
            showAgainst ? "border-cyanx text-cyanx bg-cyanx/10" : "border-line text-mut"
          }`}
          title="Mostrar o que o time sofreu"
        >
          Sofridos
        </button>
      </header>

      {/* Seletor de métrica */}
      <div className="px-3 pt-2">
        <select
          value={current}
          onChange={(e) => setMetric(e.target.value)}
          className="w-full h-8 px-2 rounded-xl border border-line bg-panel2 text-ink text-[11px] font-bold"
        >
          {options.map((k) => (
            <option key={k} value={k}>
              {LABELS[k]}
            </option>
          ))}
        </select>
      </div>

      <div className="px-1 pt-2 pb-1" style={{ height: 190 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--line)" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 9, fill: "var(--mut)" }}
              axisLine={{ stroke: "var(--line)" }}
              tickLine={false}
              interval={0}
            />
            <YAxis tick={{ fontSize: 9, fill: "var(--mut)" }} axisLine={false} tickLine={false} width={34} />
            <Tooltip
              cursor={{ fill: "var(--panel2)" }}
              contentStyle={{
                background: "var(--panel)",
                border: "1px solid var(--line)",
                borderRadius: 10,
                fontSize: 11,
                color: "var(--ink)",
              }}
              formatter={(value, name) => [
                String(value ?? ""),
                name === "favor" ? LABELS[current] : `${LABELS[current]} sofridos`,
              ]}
              labelFormatter={(label) => `vs ${label}`}
            />
            <ReferenceLine
              y={avg}
              stroke="var(--warn)"
              strokeDasharray="4 3"
              label={{ value: `média ${avg}`, fontSize: 8, fill: "var(--warn)", position: "insideTopRight" }}
            />
            <Bar dataKey="favor" radius={[3, 3, 0, 0]} maxBarSize={26}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={RESULT_COLOR[d.result] ?? "var(--acc)"} fillOpacity={0.85} />
              ))}
            </Bar>
            {showAgainst && (
              <Bar dataKey="contra" fill="var(--cyanx)" fillOpacity={0.45} radius={[3, 3, 0, 0]} maxBarSize={26} />
            )}
            <Legend
              wrapperStyle={{ fontSize: 9, color: "var(--mut)" }}
              formatter={(v) => (v === "favor" ? "A favor" : "Sofridos")}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="px-3 pb-2 text-[9px] text-mut">
        Cores: verde = vitória · cinza = empate · vermelho = derrota · ✈ = fora de casa
      </p>
    </section>
  );
}
