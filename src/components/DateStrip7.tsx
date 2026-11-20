"use client";

import { useEffect, useRef } from "react";
import { diasDaSemana, hojeYmd } from "@/lib/semana";

/**
 * Barra fixa com os 7 dias da semana corrente (Segunda → Domingo).
 *
 * Fixa no topo da lista (`sticky`) para não sumir ao rolar, e com rolagem
 * horizontal própria para caber em 360px. A data vem de fora — este componente
 * não guarda estado, quem manda é a URL.
 */
export default function DateStrip7({
  value,
  onChange,
  hoje = hojeYmd(),
}: {
  value: string;
  onChange: (ymd: string) => void;
  hoje?: string;
}) {
  const dias = diasDaSemana(value, hoje);
  const ativoRef = useRef<HTMLButtonElement | null>(null);

  // mantém o dia selecionado visível quando a barra está rolada
  useEffect(() => {
    const el = ativoRef.current;
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest", inline: "center" });
    }
  }, [value]);

  return (
    <div className="sticky top-0 z-30 -mx-3 mb-2 bg-bg/95 px-3 pt-1 pb-1.5 backdrop-blur">
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {dias.map((d) => {
          const on = d.ymd === value;
          return (
            <button
              key={d.ymd}
              ref={on ? ativoRef : undefined}
              onClick={() => onChange(d.ymd)}
              aria-pressed={on}
              aria-label={`${d.rotuloLongo}, ${d.dia}/${d.mes}`}
              className={`shrink-0 flex flex-col items-center rounded-xl border px-3 py-1 transition-colors ${
                on
                  ? "border-acc bg-acc text-black"
                  : d.hoje
                    ? "border-acc/50 bg-panel text-acc"
                    : "border-line bg-panel text-mut"
              }`}
            >
              <span className="text-[9px] font-extrabold tracking-wide">{d.rotulo}</span>
              <span className={`text-[11px] font-extrabold tabular-nums ${on ? "text-black/70" : ""}`}>
                {d.dia}/{d.mes}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
