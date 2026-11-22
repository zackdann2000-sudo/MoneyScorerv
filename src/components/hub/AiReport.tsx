"use client";

/**
 * Card "Relatório IA" — o resumo em linguagem natural no topo do detalhe do jogo.
 *
 * Componente bobo de propósito: toda a lógica (o que pode e o que não pode ser
 * dito) está em `@/lib/hub/aiReport`, que é puro e testável. Aqui só tipografia.
 */
import { Sparkles } from "lucide-react";
import type { RelatorioIA } from "@/lib/hub/aiReport";

export default function AiReport({ relatorio }: { relatorio: RelatorioIA }) {
  return (
    <div className="rounded-xl border border-acc/30 bg-panel p-3">
      <div className="flex items-start gap-1.5">
        <Sparkles size={13} className="mt-0.5 shrink-0 text-acc" />
        <p className="font-display text-[12px] font-bold leading-snug text-acc">{relatorio.manchete}</p>
      </div>
      <div className="mt-1.5 space-y-1.5">
        {relatorio.paragrafos.map((texto, i) => (
          <p key={i} className="text-[12px] leading-relaxed text-ink">
            {texto}
          </p>
        ))}
      </div>
      <p className="mt-2 border-t border-line pt-1.5 text-[9px] leading-snug text-mut">
        Texto gerado a partir dos números desta análise (1X2, gols esperados, xG, H2H, forma e Value Bet). Não é garantia de
        resultado — e nada aqui foi inventado fora do que o modelo calculou.
      </p>
    </div>
  );
}
