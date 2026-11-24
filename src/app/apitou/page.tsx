"use client";

import { Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Crosshair, Activity, Radar } from "lucide-react";
import JogosTab from "@/components/apitou/JogosTab";
import AnaliseTab from "@/components/apitou/AnaliseTab";
import DesajustesTab from "@/components/apitou/DesajustesTab";

type AbaKey = "jogos" | "analise" | "desajustes";

/** Data de hoje no fuso de Brasília (o site trabalha em UTC-3). */
function hojeLocal(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/**
 * Página do módulo /apitou.
 *
 * A URL é a FONTE DE VERDADE da navegação (mesmo padrão do /gameread):
 *   /apitou                      -> aba Jogos do Dia, hoje
 *   /apitou?aba=desajustes       -> aba Desajustes
 *   /apitou?jogo=19676650&data=2026-11-16  -> Análise do jogo (deep-link)
 *
 * Derivar o estado da URL em vez de sincronizar com useEffect evita renders em
 * cascata e faz voltar/avançar do browser funcionar de graça.
 */
function ApitouInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlJogo = searchParams.get("jogo");
  const urlAba = searchParams.get("aba");
  const urlData = searchParams.get("data");
  const urlLiga = searchParams.get("liga");

  const date = urlData && /^\d{4}-\d{2}-\d{2}$/.test(urlData) ? urlData : hojeLocal();
  const jogoId = urlJogo && /^\d+$/.test(urlJogo) ? Number(urlJogo) : null;
  const liga = urlLiga || null;
  const aba: AbaKey = jogoId ? "analise" : urlAba === "desajustes" ? "desajustes" : "jogos";

  const sincronizar = useCallback(
    (params: { aba?: AbaKey; jogo?: number | null; data?: string; liga?: string | null }) => {
      const q = new URLSearchParams();
      q.set("data", params.data ?? date);
      const l = params.liga === undefined ? liga : params.liga;
      if (l) q.set("liga", l);
      if (params.jogo) q.set("jogo", String(params.jogo));
      else if (params.aba && params.aba !== "jogos") q.set("aba", params.aba);
      router.replace(`/apitou?${q.toString()}`, { scroll: false });
    },
    [router, date, liga],
  );

  const abrirJogo = useCallback((id: number) => sincronizar({ jogo: id }), [sincronizar]);
  const irParaAba = useCallback((a: AbaKey) => sincronizar({ aba: a, liga: null }), [sincronizar]);
  /* Dia e liga vão para a URL: voltar do browser não reseta para hoje. */
  const mudarDia = useCallback((ymd: string) => sincronizar({ data: ymd }), [sincronizar]);
  const abrirLiga = useCallback((nome: string) => sincronizar({ liga: nome }), [sincronizar]);
  const voltarLigas = useCallback(() => sincronizar({ liga: null }), [sincronizar]);

  return (
    <div className="max-w-2xl mx-auto px-3 py-3 space-y-3">
        <header className="flex items-center gap-2">
        <Radar size={17} className="text-acc shrink-0" />
        <div className="min-w-0">
          <h1 className="text-base font-extrabold text-ink leading-tight">Apitou · props radar</h1>
          <p className="text-[10px] text-mut leading-tight">
            Probabilidades por Poisson sobre o mercado real
          </p>
        </div>
      </header>

      {/* Abas principais */}
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
          onClick={() => irParaAba("analise")}
          disabled={!jogoId}
          className={`flex-1 h-9 rounded-xl text-[11px] font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 ${
            aba === "analise" ? "bg-acc text-bg" : "text-mut"
          }`}
        >
          <Activity size={13} /> Análise
        </button>
        <button
          onClick={() => irParaAba("desajustes")}
          className={`flex-1 h-9 rounded-xl text-[11px] font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors ${
            aba === "desajustes" ? "bg-acc text-bg" : "text-mut"
          }`}
        >
          <Crosshair size={13} /> Desajustes
        </button>
      </nav>

      {/* Conteúdo */}
      {aba === "jogos" && (
        <JogosTab
          date={date}
          onAbrirJogo={abrirJogo}
          onMudarDia={mudarDia}
          liga={liga}
          onAbrirLiga={abrirLiga}
          onVoltarLigas={voltarLigas}
        />
      )}

      {aba === "analise" &&
        (jogoId ? (
          <AnaliseTab jogoId={jogoId} onVoltar={() => irParaAba("jogos")} />
        ) : (
          <div className="rounded-2xl border border-line bg-panel p-8 text-center text-mut text-sm">
            Escolha um jogo em{" "}
            <button onClick={() => irParaAba("jogos")} className="text-acc font-bold underline">
              Jogos do Dia
            </button>{" "}
            para ver a análise.
          </div>
        ))}

      {aba === "desajustes" && <DesajustesTab date={date} onAbrirJogo={abrirJogo} />}

        <p className="text-[10px] text-mut text-center leading-relaxed pt-1 pb-20">
          Dados públicos do Apitou (SportMonks). O modelo estima probabilidade por Poisson — não é
          garantia de resultado. Aposte com responsabilidade.
        </p>
      </div>
  );
}

/**
 * `useSearchParams()` exige Suspense boundary na prerenderização estática,
 * senão o `next build` falha com missing-suspense-with-csr-bailout.
 */
export default function ApitouPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-2xl mx-auto px-3 py-10 text-center text-mut text-sm">Carregando…</div>
      }
    >
      <ApitouInner />
    </Suspense>
  );
}