"use client";

import { Suspense, useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Radar, Swords } from "lucide-react";
import FixturesTab from "@/components/gameread/FixturesTab";
import PropsTab from "@/components/gameread/PropsTab";
import FixtureDetailTab from "@/components/gameread/FixtureDetailTab";

type TabKey = "fixtures" | "props" | "detail";

/** Aba de origem, para o "Voltar" do detalhe respeitar de onde o usuário veio. */
type Origin = "fixtures" | "props";

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

/**
 * O conteúdo usa `useSearchParams()`, que na prerenderização estática exige um
 * Suspense boundary acima (senão `next build` falha com
 * missing-suspense-with-csr-bailout). Por isso o export default só embrulha o
 * componente interno em <Suspense>.
 */
function GameReadInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Deep-link: /gameread?jogo=<id>&data=YYYY-MM-DD abre o detalhe direto.
  // Sem isso, recarregar a página de detalhes voltava para a lista, porque o
  // fixtureId vivia só em memória.
  const initialFixture = searchParams.get("jogo");
  const initialDate = searchParams.get("data");
  const initialTab = searchParams.get("aba");

  // A URL é a FONTE DE VERDADE da navegação. Derivamos o estado dela em vez de
  // sincronizar com um effect: setState dentro de effect causava render em
  // cascata (regra react-hooks/set-state-in-effect). Assim, voltar/avançar no
  // browser, recarregar e deep-link funcionam com a mesma mecânica.
  const [dateOverride, setDateOverride] = useState<string | null>(null);

  const urlJogo = searchParams.get("jogo");
  const urlAba = searchParams.get("aba");
  const urlData = searchParams.get("data");

  const date =
    dateOverride ?? (urlData && /^\d{4}-\d{2}-\d{2}$/.test(urlData) ? urlData : localDate());

  const tab: TabKey = urlJogo ? "detail" : urlAba === "jogos" ? "fixtures" : "props";
  const fixtureId = urlJogo;

  // Origem do "Voltar": guardada só na sessão (não precisa sobreviver ao reload;
  // no reload o padrão é voltar para Jogos do Dia).
  const [origin, setOrigin] = useState<Origin>("props");

  /** Escreve a URL correspondente ao estado (replace: não empilha histórico). */
  const syncUrl = useCallback(
    (t: TabKey, id: string | null, d: string) => {
      const q = new URLSearchParams();
      if (t === "detail" && id) {
        q.set("jogo", id);
        q.set("data", d);
      } else {
        if (t === "fixtures") q.set("aba", "jogos");
        q.set("data", d);
      }
      router.replace(`/gameread?${q.toString()}`, { scroll: false });
    },
    [router],
  );

  const openFixture = useCallback(
    (id: string, from: Origin) => {
      setOrigin(from);
      syncUrl("detail", id, date);
    },
    [syncUrl, date],
  );

  const goTab = useCallback(
    (t: TabKey) => {
      // Ao sair do detalhe, mantém o último jogo na URL apenas se ele ainda
      // existir — do contrário a aba "Detalhes" ficaria habilitada sem alvo.
      syncUrl(t, t === "detail" ? fixtureId : null, date);
    },
    [syncUrl, fixtureId, date],
  );

  const changeDate = useCallback(
    (d: string) => {
      setDateOverride(d);
      // Mantém a aba atual; se estiver no detalhe, o jogo pertence a outra data.
      syncUrl(tab === "detail" ? "fixtures" : tab, null, d);
    },
    [syncUrl, tab],
  );

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
          onClick={() => changeDate(shiftDate(date, -1))}
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
            onChange={(e) => e.target.value && changeDate(e.target.value)}
            className="w-full h-8 pl-8 pr-2 rounded-xl border border-line bg-panel text-ink text-[11px] font-bold"
          />
        </label>
        <button
          onClick={() => changeDate(shiftDate(date, 1))}
          className="shrink-0 w-8 h-8 rounded-xl border border-line text-mut text-sm font-bold inline-flex items-center justify-center"
          aria-label="Próximo dia"
        >
          ›
        </button>
        <button
          onClick={() => changeDate(localDate())}
          className="shrink-0 px-2.5 h-8 rounded-xl border border-line text-ink text-[10px] font-bold"
        >
          Hoje
        </button>
      </div>

      {/* Abas principais */}
      <nav className="flex gap-1.5 p-1 rounded-2xl bg-panel border border-line">
        <button
          onClick={() => goTab("props")}
          className={`flex-1 h-9 rounded-xl text-[11px] font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors ${
            tab === "props" ? "bg-acc text-bg" : "text-mut"
          }`}
        >
          <Radar size={13} /> Props Radar
        </button>
        <button
          onClick={() => goTab("fixtures")}
          className={`flex-1 h-9 rounded-xl text-[11px] font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors ${
            tab === "fixtures" ? "bg-acc text-bg" : "text-mut"
          }`}
        >
          <CalendarDays size={13} /> Jogos do Dia
        </button>
        <button
          onClick={() => goTab("detail")}
          disabled={!fixtureId}
          className={`flex-1 h-9 rounded-xl text-[11px] font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 ${
            tab === "detail" ? "bg-acc text-bg" : "text-mut"
          }`}
        >
          <Swords size={13} /> Detalhes
        </button>
      </nav>

      {/* Conteúdo */}
      {tab === "props" && <PropsTab date={date} onOpenFixture={(id) => openFixture(id, "props")} />}
      {tab === "fixtures" && <FixturesTab date={date} onOpenFixture={(id) => openFixture(id, "fixtures")} />}
      {tab === "detail" &&
        (fixtureId ? (
          <FixtureDetailTab fixtureId={fixtureId} onBack={() => goTab(origin)} backLabel={origin === "fixtures" ? "Jogos do Dia" : "Props Radar"} />
        ) : (
          <div className="rounded-2xl border border-line bg-panel p-8 text-center text-mut text-sm">
            Escolha um jogo em{" "}
            <button onClick={() => goTab("fixtures")} className="text-acc font-bold underline">
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

export default function GameReadPage() {
  return (
    <Suspense fallback={<div className="max-w-2xl mx-auto px-3 py-10 text-center text-mut text-sm">Carregando…</div>}>
      <GameReadInner />
    </Suspense>
  );
}
