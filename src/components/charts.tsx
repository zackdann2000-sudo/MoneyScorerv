"use client";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, ReferenceLine, Cell, Tooltip, PieChart, Pie, RadarChart, Radar, PolarGrid, PolarAngleAxis, AreaChart, Area, CartesianGrid, Legend } from "recharts";

const ACC = "#23e57b", MUT = "#5c7263", PURPLE = "#a855f7", RED = "#ff5d5d", HOME = "#4d9fff", AWAY = "#ff8a4d", WARN = "#ffc53d";

/* Barras "Últimos 10 Jogos" — clicáveis, com escudo do adversário e linha tracejada */
export function GoalsBars({ games, line = 0.5, onSelect, color = PURPLE }: { games: { opp: string; logo?: string; valor: number; gf?: number; ga?: number }[]; line?: number; onSelect?: (i: number) => void; color?: string }) {
  const max = Math.max(line + 1, ...games.map((g) => g.valor)) + 0.6;
  return (
    <div>
      <div className="flex" style={{ paddingLeft: 26, paddingRight: 4 }}>
        {games.map((g, i) => (
          <button key={i} onClick={() => onSelect?.(i)} className="flex-1 flex justify-center min-w-0">
            {g.logo ? <img src={g.logo} alt={g.opp} className="w-4.5 h-4.5 object-contain" /> : <span className="text-[8px] text-mut">{g.opp}</span>}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={150}>
        <BarChart data={games} margin={{ top: 4, right: 4, left: -32, bottom: 0 }} barCategoryGap="25%">
          <XAxis dataKey="opp" tick={{ fontSize: 8, fill: MUT }} axisLine={false} tickLine={false} interval={0} />
          <YAxis domain={[0, max]} tick={{ fontSize: 9, fill: MUT }} axisLine={false} tickLine={false} allowDecimals={false} />
          <ReferenceLine y={line} stroke={WARN} strokeDasharray="5 4" strokeWidth={1.5} />
          <Bar dataKey="valor" radius={[4, 4, 0, 0]} onClick={(_, i) => onSelect?.(i)} cursor="pointer" isAnimationActive>
            {games.map((g, i) => <Cell key={i} fill={g.valor > line ? color : "#3a4a40"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Donut({ greens, reds, pending }: { greens: number; reds: number; pending: number }) {
  const data = [
    { name: "Greens", value: greens, fill: ACC },
    { name: "Reds", value: reds, fill: RED },
    { name: "Pendentes", value: pending, fill: "#3a4a40" },
  ].filter((d) => d.value > 0);
  const total = greens + reds;
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={190}>
        <PieChart>
          <Pie data={data.length ? data : [{ name: "Sem dados", value: 1, fill: "#22332a" }]} dataKey="value" innerRadius={62} outerRadius={82} paddingAngle={3} strokeWidth={0} />
          <Tooltip contentStyle={{ background: "#0d1c13", border: "1px solid #1d3626", borderRadius: 8, fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="font-display font-bold text-3xl text-acc">{total ? Math.round((greens / total) * 100) : "—"}%</span>
        <span className="text-[10px] text-mut uppercase tracking-wider">Taxa de acerto</span>
      </div>
    </div>
  );
}

/* Radar do jogador vs líder/média da liga */
export function PlayerRadar({ attrs }: { attrs: { label: string; player: number; league: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <RadarChart data={attrs} outerRadius="72%">
        <PolarGrid stroke="#1d3626" />
        <PolarAngleAxis dataKey="label" tick={{ fontSize: 10, fill: MUT }} />
        <Radar name="Liga (líder)" dataKey="league" stroke={WARN} fill={WARN} fillOpacity={0.12} />
        <Radar name="Jogador" dataKey="player" stroke={ACC} fill={ACC} fillOpacity={0.3} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Tooltip contentStyle={{ background: "#0d1c13", border: "1px solid #1d3626", borderRadius: 8, fontSize: 12 }} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

/* Momentum: pressão por lances (ESPN) — área espelhada */
export function Momentum({ data, illustrative }: { data: { min: number; home: number; away: number }[]; illustrative?: boolean }) {
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={130}>
        <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#1d3626" strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="min" tick={{ fontSize: 9, fill: MUT }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}'`} />
          <YAxis hide domain={[-4, 4]} />
          <ReferenceLine y={0} stroke="#1d3626" />
          <Area type="monotone" dataKey="home" stroke={HOME} fill={HOME} fillOpacity={0.45} name="Casa" />
          <Area type="monotone" dataKey="away" stroke={AWAY} fill={AWAY} fillOpacity={0.45} name="Visitante" />
        </AreaChart>
      </ResponsiveContainer>

      {/* Sem dados reais minuto a minuto: o véu impede ler a curva sintética
          como se fosse do jogo. Sem cadeado — cadeado significa bloqueio de
          plano; aqui o dado simplesmente não existe na fonte. */}
      {illustrative && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 rounded-lg bg-black/60 backdrop-blur-[1px]">
          <p className="text-[10px] font-bold text-mut text-center px-3 leading-snug">
            Dados minuto a minuto indisponíveis
          </p>
          <p className="text-[9px] text-mut/60 text-center px-3">curva ilustrativa, não deste jogo</p>
        </div>
      )}
    </div>
  );
}

/* Radial duplo (H2H): % dos dois times */
export function RadialDuo({ label, home, away }: { label: string; home: number; away: number }) {
  const ring = (v: number, color: string) => (
    <div className="relative w-16 h-16">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={[{ v: v }, { v: 100 - v }]} dataKey="v" innerRadius={22} outerRadius={30} startAngle={90} endAngle={-270} strokeWidth={0}>
            <Cell fill={color} /><Cell fill="#22332a" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold">{Math.round(v)}%</span>
    </div>
  );
  return (
    <div className="flex flex-col items-center gap-1 bg-panel border border-line rounded-xl p-2">
      <div className="flex gap-1">{ring(home, HOME)}{ring(away, AWAY)}</div>
      <span className="text-[10px] text-mut font-semibold uppercase tracking-wide text-center">{label}</span>
    </div>
  );
}

/* Comparador de jogadores */
export function CompareBars({ data, keys, colors }: { data: any[]; keys: string[]; colors?: string[] }) {
  const palette = [ACC, HOME, AWAY, PURPLE];
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -26, bottom: 0 }}>
        <XAxis dataKey="stat" tick={{ fontSize: 9, fill: MUT }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 9, fill: MUT }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ background: "#0d1c13", border: "1px solid #1d3626", borderRadius: 8, fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        {keys.map((k, i) => <Bar key={k} dataKey={k} fill={colors?.[i] || palette[i % 4]} radius={[3, 3, 0, 0]} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}