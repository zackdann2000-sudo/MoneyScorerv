"use client";

import { useEffect, useState } from "react";
import { Flame, TrendingUp } from "lucide-react";
import FatoresXg from "@/components/hub/FatoresXg";
import PadroesEstatisticos from "@/components/hub/PadroesEstatisticos";
import type { FatorXgBruto } from "@/lib/hub/fatoresXg";
import type { InsightCache } from "@/lib/hub/padroes";

/**
 * "Fatores de xG" + "Padrões estatísticos" na aba Pré-Live de `/jogos/[id]`.
 *
 * A Pré-Live trabalha com o id do evento na ESPN; o Hub guarda outra chave. Quem
 * faz a ponte é a rota fina `/api/matches/[id]/insights`, que só lê cache —
 * nenhum fornecedor é chamado e nenhum número é recalculado aqui.
 *
 * Jogo que o Hub não sincronizou (`found: false`) não renderiza nada: a Pré-Live
 * já mostra a análise da ESPN, e dois cartões de "indisponível" seriam só ruído.
 */

type Resposta = {
  found?: boolean;
  xg?: { home: number; away: number } | null;
  labInsights?: InsightCache[];
  xgFactors?: FatorXgBruto[];
  analise?: { tipo: string; atualizadoEm: string } | null;
};

function Cabecalho({ icone, titulo, nota }: { icone: React.ReactNode; titulo: string; nota?: string }) {
  return (
    <div className="mb-1 flex items-center gap-1.5 px-0.5">
      <span className="text-acc">{icone}</span>
      <h3 className="font-display text-[10px] font-black uppercase tracking-wide text-txt">{titulo}</h3>
      {nota && <span className="ml-auto text-[9px] font-bold text-mut">{nota}</span>}
    </div>
  );
}

export function InsightsCache({ matchId, home, away }: { matchId: string; home: string; away: string }) {
  const [dados, setDados] = useState<Resposta | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/matches/${matchId}/insights`)
      .then((r) => r.json())
      .then((j) => vivo && setDados((j ?? {}) as Resposta))
      .catch(() => vivo && setDados({}));
    return () => {
      vivo = false;
    };
  }, [matchId]);

  if (!dados) {
    return (
      <div className="space-y-2">
        <div className="skeleton h-4 w-32" />
        <div className="skeleton h-24" />
      </div>
    );
  }

  if (!dados.found) return null;

  const nota = dados.analise
    ? `${dados.analise.tipo === "Final" ? "análise final" : "preview"} · ${new Date(dados.analise.atualizadoEm).toLocaleDateString("pt-BR")}`
    : undefined;

  return (
    <div className="space-y-4">
      <section>
        <Cabecalho icone={<Flame className="h-3.5 w-3.5" />} titulo="Fatores de xG" nota={nota} />
        <FatoresXg home={{ name: home }} away={{ name: away }} xg={dados.xg ?? null} fatores={dados.xgFactors ?? []} />
      </section>
      <section>
        <Cabecalho
          icone={<TrendingUp className="h-3.5 w-3.5" />}
          titulo="Padrões estatísticos"
          nota={dados.labInsights?.length ? `${dados.labInsights.length} padrões` : undefined}
        />
        <PadroesEstatisticos padroes={dados.labInsights ?? []} />
      </section>
    </div>
  );
}

export default InsightsCache;
