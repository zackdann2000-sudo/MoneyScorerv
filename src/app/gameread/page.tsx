"use client";

import { useState } from "react";
import { CalendarDays, Radar, Swords } from "lucide-react";
import FixturesTab from "@/components/gameread/FixturesTab";
import PropsTab from "@/components/gameread/PropsTab";
import FixtureDetailTab from "@/components/gameread/FixtureDetailTab";

type TabKey = "fixtures" | "props" | "detail";

/** Data local no formato YYYY-MM-DD (o fuso é enviado pelo servidor). */
function localDate(): string {
  const off = new Date().getTimezoneOffset();
  return new Date(Date.now() - off * 60_000).toISOString().slice(0, 10);
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function GameReadPage() {
  const [tab, setTab] = useState<TabKey>("props");
  const [date, setDate] = useState(localDate);
  const [fixtureId, setFixtureId] = useState<string | null>(null);

  const openFixture = (id: string) => {
    setFixtureId(id);
    setTab("detail");
  };

  return (
    <div className="max-w-2xl mx-auto px-3 py-3 space-y-3">
      {/* Cabeçalho do módulo */}
      <header className="space-y-1">
        <h1 className="font-display text-lg font-extrabold text-ink flex items-center gap-2">
          <Radar size={18} className="text-acc" /> GameRead
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-acc/15 text-acc uppercase tracking-wide">
            beta
          </span>
        </h1>
        <p className="text-[11px] text-mut">
          Props radar com taxa de acerto real (L5 · L10 · temporada), odds por casa e comparativo estatístico.
        </p>
      </header>

      {/* Seletor de data */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setDate((d) => shiftDate(d, -1))}
          className="shrink-0 w-8 h-8 rounded-xl border border-line text-mut text-sm font-bold inline-flex items-center justify-center"
          aria-label="Dia anterior"
        >
          ‹
        </button>
        <label className="flex-1 relative">
          <CalendarDays size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-mut pointer-events-none" />
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="w-full h-8 pl-8 pr-2 rounded-xl border border-line bg-panel text-ink text-[11px] font-bold"
          />
        </label>
        <button
          onClick={() => setDate((d) => shiftDate(d, 1))}
          className="shrink-0 w-8 h-8 rounded-xl border border-line text-mut text-sm font-bold inline-flex items-center justify-center"
          aria-label="Próximo dia"
        >
          ›
        </button>
        <button
          onClick={() => setDate(localDate())}
          className="shrink-0 px-2.5 h-8 rounded-xl border border-line text-ink text-[10px] font-bold"
        >
          Hoje
        </button>
      </div>

      {/* Abas principais */}
      <nav className="flex gap-1.5 p-1 rounded-2xl bg-panel border border-line">
        <button
          onClick={() => setTab("props")}
          className={`flex-1 h-9 rounded-xl text-[11px] font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors ${
            tab === "props" ? "bg-acc text-bg" : "text-mut"
          }`}
        >
          <Radar size={13} /> Props Radar
        </button>
        <button
          onClick={() => setTab("fixtures")}
          className={`flex-1 h-9 rounded-xl text-[11px] font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors ${
            tab === "fixtures" ? "bg-acc text-bg" : "text-mut"
          }`}
        >
          <CalendarDays size={13} /> Jogos do Dia
        </button>
        <button
          onClick={() => setTab("detail")}
          disabled={!fixtureId}
          className={`flex-1 h-9 rounded-xl text-[11px] font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 ${
            tab === "detail" ? "bg-acc text-bg" : "text-mut"
          }`}
        >
          <Swords size={13} /> Detalhes
        </button>
      </nav>

      {/* Conteúdo */}
      {tab === "props" && <PropsTab date={date} onOpenFixture={openFixture} />}
      {tab === "fixtures" && <FixturesTab date={date} onOpenFixture={openFixture} />}
      {tab === "detail" &&
        (fixtureId ? (
          <FixtureDetailTab fixtureId={fixtureId} onBack={() => setTab("fixtures")} />
        ) : (
          <div className="rounded-2xl border border-line bg-panel p-8 text-center text-mut text-sm">
            Escolha um jogo em{" "}
            <button onClick={() => setTab("fixtures")} className="text-acc font-bold underline">
              Jogos do Dia
            </button>{" "}
            ou toque em uma prop para abrir os detalhes.
          </div>
        ))}

      <p className="text-[10px] text-mut text-center leading-relaxed pt-1 pb-4">
        Dados públicos do GameRead. Taxa de acerto passada não garante resultado futuro. Aposte com responsabilidade
        · +18
      </p>
    </div>
  );
}
