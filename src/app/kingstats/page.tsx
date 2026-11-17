"use client";

import { Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Flame, LineChart, Crown } from "lucide-react";
import JogosTab from "@/components/kingstats/JogosTab";
import OportunidadesTab from "@/components/kingstats/OportunidadesTab";
import DesempenhoTab from "@/components/kingstats/DesempenhoTab";
import JogoDetalhe from "@/components/kingstats/JogoDetalhe";

type AbaKey = "jogos" | "oportunidades" | "desempenho";

/** Data de hoje no fuso de Brasília (a fonte usa esse fuso). */
function hojeLocal(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/**
 * Página do módulo /kingstats (engenharia reversa do thekingstats.com).
 *
 * URL como fonte de verdade, igual ao /gameread e /apitou:
 *   /kingstats                          -> aba Jogos, hoje
 *   /kingstats?aba=oportunidades        -> aba Oportunidades
 *   /kingstats?aba=desempenho           -> aba Desempenho
 *   /kingstats?jogo=<id>&data=YYYY-MM-DD -> análise do jogo (deep-link)
 */
function KingInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlJogo = searchParams.get("jogo");
  const urlAba = searchParams.get("aba");
  const urlData = searchParams.get("data");

  const date = urlData && /^\d{4}-\d{2}-\d{2}$/.test(urlData) ? urlData : hojeLocal();
  const jogoId = urlJogo && /^\d+$/.test(urlJogo) ? urlJogo : null;
  const aba: AbaKey =
    urlAba === "oportunidades" ? "oportunidades" : urlAba === "desempenho" ? "desempenho" : "jogos";

  const sincronizar = useCallback(
    (params: { aba?: AbaKey; jogo?: string | null; data?: string }) => {
      const q = new URLSearchParams();
      if (params.jogo) {
        q.set("jogo", params.jogo);
        q.set("data", params.data ?? date);
      } else if (params.aba && params.aba !== "jogos") {
        q.set("aba", params.aba);
        q.set("data", params.data ?? date);
      }
      const qs = q.toString();
      router.replace(`/kingstats${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, date],
  );

  const abrirJogo = useCallback((id: string) => sincronizar({ jogo: id }), [sincronizar]);
  const irParaAba = useCallback((a: AbaKey) => sincronizar({ aba: a }), [sincronizar]);

  return (
    <div className="max-w-2xl mx-auto px-3 py-3 space-y-3">
      <header className="flex items-center gap-2">
        <Crown size={17} className="text-acc shrink-0" />
        <div className="min-w-0">
          <h1 className="text-base font-extrabold text-ink leading-tight">King STATS · radar</h1>
          <p className="text-[10px] text-mut leading-tight">
            Estatísticas de futebol + oportunidades por Poisson
          </p>
        </div>
      </header>

      {!jogoId && (
        <nav className="flex gap-1.5 p-1 rounded-2xl bg-panel border border-line">
          <button
            onClick={() => irParaAba("jogos")}
            className={`flex-1 h-9 rounded-xl text-[11px] font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors ${
              aba === "jogos" ? "bg-acc text-bg" : "text-mut"
            }`}
          >
            <CalendarDays size={13} /> Jogos
          </button>
          <button
            onClick={() => irParaAba("oportunidades")}
            className={`flex-1 h-9 rounded-xl text-[11px] font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors ${
              aba === "oportunidades" ? "bg-acc text-bg" : "text-mut"
            }`}
          >
            <Flame size={13} /> Oportunidades
          </button>
          <button
            onClick={() => irParaAba("desempenho")}
            className={`flex-1 h-9 rounded-xl text-[11px] font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors ${
              aba === "desempenho" ? "bg-acc text-bg" : "text-mut"
            }`}
          >
            <LineChart size={13} /> Desempenho
          </button>
        </nav>
      )}

      {jogoId ? (
        <JogoDetalhe jogoId={jogoId} date={date} onVoltar={() => irParaAba("jogos")} />
      ) : aba === "jogos" ? (
        <JogosTab date={date} onAbrirJogo={abrirJogo} />
      ) : aba === "oportunidades" ? (
        <OportunidadesTab date={date} onAbrirJogo={abrirJogo} />
      ) : (
        <DesempenhoTab />
      )}

      <p className="text-[10px] text-mut text-center leading-relaxed pt-1 pb-4">
        Dados públicos do The King STATS. O modelo estima probabilidade por Poisson — não é garantia
        de resultado. Aposte com responsabilidade.
      </p>
    </div>
  );
}

export default function KingStatsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-mut text-sm">Carregando…</div>}>
      <KingInner />
    </Suspense>
  );
}
