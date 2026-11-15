"use client";
import { useState } from "react";
import { Crest } from "@/components/ui";

type Team = { id: string; name: string; logo: string };

/* =======================================================================
   CARDS DE ODDS REAIS (1 · X · 2)
   Fonte: API-Football quando casa a fixture por nome+data; senão ESPN.
   Sem odd → mostra "Odd indisponível" sem quebrar a lista.
   ======================================================================= */
export default function OddsCards({
  odds,
  source,
  home,
  away,
  compact,
}: {
  odds: any;
  source?: string;
  home: Team;
  away: Team;
  compact?: boolean;
}) {
  /* Seleção do palpite: casa | empate | fora. Persistida só em memória. */
  const [pick, setPick] = useState<"home" | "draw" | "away" | null>(null);
  const temAlguma = odds && (odds.home != null || odds.draw != null || odds.away != null);

  if (!temAlguma) {
    return (
      <div className="bg-panel border border-dashed border-line rounded-xl px-3 py-2.5 text-center">
        <p className="text-[11px] font-bold text-mut">Odd indisponível</p>
        <p className="text-[9px] text-mut/70 mt-0.5">
          Esta partida não foi encontrada na fonte de odds.
        </p>
      </div>
    );
  }

  const cell = (
    label: string,
    value: number | null,
    key: "home" | "draw" | "away",
    idleCls: string
  ) => {
    const active = pick === key;
    const selecionavel = value != null;
    return (
      <button
        type="button"
        disabled={!selecionavel}
        aria-pressed={active}
        onClick={() => setPick(active ? null : key)}
        className={`flex-1 rounded-lg border px-2 py-1.5 text-center transition-colors ${
          active
            ? "bg-acc border-acc"
            : selecionavel
              ? `${idleCls} hover:border-acc/60`
              : "border-line bg-panel2 opacity-50"
        }`}
      >
        <p className={`text-[9px] font-extrabold uppercase tracking-wide ${active ? "text-black/70" : "text-mut"}`}>
          {label}
        </p>
        <p
          className={`font-display font-bold text-base leading-tight tabular-nums ${
            active ? "text-black font-extrabold" : "text-ink"
          }`}
        >
          {value != null ? Number(value).toFixed(2) : "—"}
        </p>
      </button>
    );
  };

  return (
    <div className="bg-panel border border-line rounded-xl p-2.5">
      {!compact && (
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[9px] font-extrabold uppercase tracking-widest text-mut">Odds do jogo</p>
          <span
            className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded-full ${
              source === "API-Football" ? "bg-acc/15 text-acc" : "bg-panel2 text-mut"
            }`}
          >
            {source || "—"}
          </span>
        </div>
      )}
      <div className="flex items-stretch gap-1.5">
        <div className="flex flex-col items-center justify-center w-12 shrink-0">
          <Crest src={home.logo} size={18} />
          <span className="text-[8px] text-mut truncate w-full text-center mt-0.5">{home.name}</span>
        </div>
        {cell("Casa", odds.home, "home", "border-home/40 bg-home/10")}
        {cell("Empate", odds.draw, "draw", "border-line bg-panel2")}
        {cell("Fora", odds.away, "away", "border-away/40 bg-away/10")}
        <div className="flex flex-col items-center justify-center w-12 shrink-0">
          <Crest src={away.logo} size={18} />
          <span className="text-[8px] text-mut truncate w-full text-center mt-0.5">{away.name}</span>
        </div>
      </div>
      {odds.provider && (
        <p className="text-[8px] text-mut/70 mt-1 text-center">
          Casas: {odds.provider}
          {odds.details ? ` · ${odds.details}` : ""}
        </p>
      )}
      {pick && (
        <p className="text-[9px] font-bold text-acc text-center mt-1">
          Palpite selecionado: {pick === "home" ? home.name : pick === "away" ? away.name : "Empate"}
        </p>
      )}
    </div>
  );
}
