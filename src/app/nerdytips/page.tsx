"use client";

import { Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BarChart3, CalendarDays, Sparkles } from "lucide-react";
import PalpitesTab from "@/components/nerdytips/PalpitesTab";
import PartidaTab from "@/components/nerdytips/PartidaTab";
import DestaquesTab from "@/components/nerdytips/DestaquesTab";
import DesempenhoTab from "@/components/nerdytips/DesempenhoTab";
import type { Aba } from "@/components/nerdytips/types";

const ABAS: { key: Aba; label: string; icone: typeof CalendarDays }[] = [
  { key: "palpites", label: "Palpites", icone: CalendarDays },
  { key: "destaques", label: "Destaques", icone: Sparkles },
  { key: "desempenho", label: "Desempenho", icone: BarChart3 },
];

/**
 * Módulo /nerdytips — engenharia reversa do nerdytips.com.
 *
 * A URL é a fonte de verdade da navegação (mesmo padrão de /apitou e /gameread):
 *   /nerdytips                    -> palpites do dia
 *   /nerdytips?aba=destaques      -> bet of the day + slip
 *   /nerdytips?aba=desempenho     -> histórico público
 *   /nerdytips?jogo=1340351       -> análise de um jogo (deep-link)
 */
function NerdytipsInner() {
  const router = useRouter();
  const params = useSearchParams();

  const urlJogo = params.get("jogo");
  const urlAba = params.get("aba");

  const jogoId = urlJogo && /^\d+$/.test(urlJogo) ? urlJogo : null;
  const aba: Aba = jogoId
    ? "partida"
    : urlAba === "destaques" || urlAba === "desempenho"
      ? urlAba
      : "palpites";

  const irPara = useCallback(
    (destino: { aba?: Aba; jogo?: string | null }) => {
      const q = new URLSearchParams();
      if (destino.jogo) q.set("jogo", destino.jogo);
      else if (destino.aba && destino.aba !== "palpites") q.set("aba", destino.aba);
      const qs = q.toString();
      router.replace(`/nerdytips${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router],
  );

  const abrirJogo = useCallback((id: string) => irPara({ jogo: id }), [irPara]);

  return (
    <div className="mx-auto max-w-3xl px-3 pb-24 space-y-3">
      <header className="pt-3 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-extrabold text-ink">NerdyTips</h1>
          <span className="text-[9px] font-bold text-mut uppercase tracking-wide">
            palpites de IA · fonte pública
          </span>
        </div>
        <p className="text-[10px] text-mut leading-relaxed">
          Palpites de futebol com confiança, odds e histórico de acerto do nerdytips.com. O conteúdo
          é do site; aqui a gente organiza, traduz e mostra o que ele esconde atrás do login.
        </p>
      </header>

      {aba !== "partida" && (
        <nav className="flex gap-1.5 p-1 rounded-2xl bg-panel border border-line">
          {ABAS.map(({ key, label, icone: Icone }) => (
            <button
              key={key}
              type="button"
              onClick={() => irPara({ aba: key })}
              aria-pressed={aba === key}
              className={`flex-1 h-9 rounded-xl text-[11px] font-extrabold inline-flex items-center justify-center gap-1 transition-colors ${
                aba === key ? "bg-acc text-bg" : "text-mut"
              }`}
            >
              <Icone size={12} />
              {label}
            </button>
          ))}
        </nav>
      )}

      {aba === "palpites" && <PalpitesTab onAbrirJogo={abrirJogo} />}
      {aba === "destaques" && <DestaquesTab onAbrirJogo={abrirJogo} />}
      {aba === "desempenho" && <DesempenhoTab />}
      {aba === "partida" && jogoId && (
        <PartidaTab id={jogoId} onVoltar={() => irPara({ aba: "palpites" })} />
      )}
    </div>
  );
}

export default function NerdytipsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-xs text-mut">Carregando…</div>}>
      <NerdytipsInner />
    </Suspense>
  );
}
