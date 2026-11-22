"use client";

import { useEffect, useState } from "react";
import type { ComparativoSelecao } from "@/lib/hub/model";
import OddsMultiCasa from "@/components/hub/OddsMultiCasa";

/**
 * "Odds multi-casa" na aba Pré-Live de `/jogos/[id]`.
 *
 * A Pré-Live fala o id da ESPN; o Hub guarda outra chave. A rota fina
 * `/api/matches/[id]/odds-casas` faz a ponte lendo só `hub_bookmaker_odd`.
 * Jogo que o Hub não sincronizou → não renderiza nada (a Pré-Live já mostra a
 * odd única da ESPN; dois avisos de indisponível seriam ruído).
 */

type Resposta = {
  found?: boolean;
  totalCasas?: number;
  comparativos?: ComparativoSelecao[];
};

export function OddsMultiCasaLive({ matchId, home, away }: { matchId: string; home: string; away: string }) {
  const [dados, setDados] = useState<Resposta | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/matches/${matchId}/odds-casas`)
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
        <div className="skeleton h-4 w-36" />
        <div className="skeleton h-24" />
      </div>
    );
  }

  if (!dados.found || !dados.comparativos?.length) return null;

  return (
    <section>
      <div className="mb-1 flex items-center gap-1.5 px-0.5">
        <span className="text-acc">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="8" cy="8" r="6" />
            <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
            <path d="M7 6h1v4" />
            <path d="m16.71 13.88.7.71-2.82 2.82" />
          </svg>
        </span>
        <h3 className="font-display text-[10px] font-black uppercase tracking-wide text-txt">Odds multi-casa</h3>
        {dados.totalCasas ? <span className="ml-auto text-[9px] font-bold text-mut">{dados.totalCasas} casas no total</span> : null}
      </div>
      <OddsMultiCasa comparativos={dados.comparativos} home={home} away={away} />
    </section>
  );
}

export default OddsMultiCasaLive;
