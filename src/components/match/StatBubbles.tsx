"use client";
import { useState } from "react";

/* =======================================================================
   BOLINHAS DE HISTÓRICO (últimos 10 jogos)
   verde = valor > 0 · cinza = 0 · tracejado = jogo sem dado na fonte
   ======================================================================= */
export function StatBubbles({
  values,
  max = 10,
  size = 14,
  label,
}: {
  values: (number | null)[];
  max?: number;
  size?: number;
  label?: string;
}) {
  const list = values.slice(0, max);
  const pad: (number | null)[] = [
    ...Array(Math.max(0, max - list.length)).fill(null),
    ...list,
  ];
  const total = list.reduce<number>((s, v) => s + (v ?? 0), 0);
  return (
    <div className="flex items-center gap-1.5" role="img" aria-label={label || `Últimos ${max} jogos, total ${total}`}>
      <div className="flex gap-[3px]">
        {pad.map((v, i) => (
          <span
            key={i}
            title={v === null ? "Sem dado" : `${v} ${v > 0 ? "no jogo" : "(zero)"}`}
            style={{ width: size, height: size }}
            className={`rounded-full shrink-0 border transition-colors ${
              v === null
                ? "border-dashed border-line/70 bg-transparent"
                : v > 0
                  ? "border-acc bg-acc"
                  : "border-line bg-panel2"
            }`}
          />
        ))}
      </div>
      <span className="text-[9px] font-bold text-mut tabular-nums ml-0.5">{total}</span>
    </div>
  );
}

export type PlayerStatRow = {
  id: string;
  name: string;
  team?: string;
  photo?: string;
  position?: string;
  total: number;
  average: number | null;
  values: (number | null)[];
  gameCount?: number;
  source?: string;
};

function PlayerAvatar({ src, name }: { src?: string; name: string }) {
  const [err, setErr] = useState(false);
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  if (!src || err) {
    return (
      <div className="w-11 h-11 rounded-full bg-panel2 border border-line flex items-center justify-center shrink-0">
        <span className="text-[11px] font-bold text-mut">{initials || "?"}</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      width={44}
      height={44}
      loading="lazy"
      onError={() => setErr(true)}
      className="w-11 h-11 rounded-full object-cover object-top bg-panel2 border border-line shrink-0"
    />
  );
}

/* =======================================================================
   CARD DE JOGADOR — foto, nome, time, média + bolinhas
   ======================================================================= */
export function PlayerStatCard({
  row,
  rank,
  metricLabel,
  max = 10,
}: {
  row: PlayerStatRow;
  rank?: number;
  metricLabel: string;
  max?: number;
}) {
  return (
    <div className="bg-panel border border-line rounded-xl p-2.5 flex items-center gap-2.5">
      <div className="relative shrink-0">
        <PlayerAvatar src={row.photo} name={row.name} />
        {rank != null && (
          <span className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-acc text-black text-[9px] font-extrabold flex items-center justify-center">
            {rank}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-bold leading-tight truncate">{row.name}</p>
        <p className="text-[10px] text-mut truncate">
          {row.team || "—"}
          {row.position ? ` · ${row.position}` : ""}
        </p>
        <div className="mt-1">
          <StatBubbles
            values={row.values}
            max={max}
            label={`${row.name}: ${metricLabel} nos últimos ${max} jogos`}
          />
        </div>
      </div>
      <div className="text-right shrink-0 pl-1">
        <p className="text-[9px] uppercase font-bold text-mut">{metricLabel}</p>
        <p className="font-display font-bold text-lg leading-none text-acc tabular-nums">
          {row.average != null ? row.average.toFixed(2) : "—"}
        </p>
        <p className="text-[9px] text-mut tabular-nums">últ. {row.gameCount ?? row.values.length} jogos</p>
      </div>
    </div>
  );
}

/* =======================================================================
   ESTADO VAZIO AMIGÁVEL
   ======================================================================= */
export function PlayerStatsEmpty({ label, reason }: { label: string; reason?: string }) {
  return (
    <div className="text-center py-8 px-4 bg-panel border border-dashed border-line rounded-xl">
      <span className="text-2xl">📊</span>
      <p className="font-display font-bold uppercase mt-2 text-sm">{label}</p>
      <p className="text-[11px] text-mut mt-1 max-w-xs mx-auto leading-relaxed">
        {reason || "Dados indisponíveis para esta partida."}
      </p>
      <p className="text-[10px] text-mut/70 mt-2">
        Não exibimos números estimados — só o que a fonte realmente publicou.
      </p>
    </div>
  );
}
