"use client";

import { useEffect, useState } from "react";
import type { Periodo, QuentesLado, Sequencia, Tendencia } from "@/lib/tendencias";

/**
 * Hook único para `/api/matches/[id]/tendencias`.
 *
 * Por que existe: a mesma resposta alimenta a aba TENDÊNCIAS e o bloco Quentes
 * dentro de ESTATÍSTICAS. Sem dedupe seriam duas idas à rede para o mesmo
 * dado. O memo é de módulo (vive enquanto a aba da partida estiver montada) e a
 * chave inclui os parâmetros, porque trocar a janela muda o resultado.
 *
 * O cache caro (histórico de 10 jogos por time) é do servidor, em banco. Este
 * aqui é só para não repetir o fetch na mesma sessão de tela.
 */

export type TendenciaItem = Tendencia & { destaque: boolean };

export type TendenciasResp = {
  match: {
    id: string;
    league: string;
    leagueName?: string;
    home: { id: string; name: string };
    away: { id: string; name: string };
    date?: string;
    state?: string;
  };
  params: { amostra: number; periodo: Periodo; lado: string; limiar: number };
  tendencias: TendenciaItem[];
  resumo: {
    total: number;
    cemPorCento: number;
    casaJogos: number;
    foraJogos: number;
    baseParcial: boolean;
    suficiente: boolean;
    maxAmostra: number;
  };
  quentes: { casa: QuentesLado; fora: QuentesLado };
  fontes: {
    casa: { origem: string; idadeMin: number | null; fonte: string; jogos: number };
    fora: { origem: string; idadeMin: number | null; fonte: string; jogos: number };
  };
  updatedAt: string;
};

export type ParamsTend = { amostra?: number; periodo?: Periodo; lado?: "todos" | "casa" | "fora" };

const memo = new Map<string, TendenciasResp>();

export function chaveTend(matchId: string, league: string, p: ParamsTend): string {
  return `${matchId}|${league}|${p.amostra ?? 10}|${p.periodo ?? "total"}|${p.lado ?? "todos"}`;
}

export function useTendencias(matchId: string, league: string, p: ParamsTend = {}) {
  const key = chaveTend(matchId, league, p);
  /* Cache de módulo e último resultado remoto são lidos no RENDER: nada de
     `setState` síncrono no corpo do efeito só para copiar o cache (regra
     `react-hooks/set-state-in-effect`). O resultado remoto carrega a chave a
     que pertence, então trocar os filtros volta ao esqueleto na hora. */
  const doCache = memo.get(key) ?? null;
  const [remoto, setRemoto] = useState<{ key: string; data: TendenciasResp | null; error: string | null }>({
    key: "",
    data: null,
    error: null,
  });

  useEffect(() => {
    if (memo.has(key)) return; // já veio do cache neste render
    let vivo = true;
    const qs = new URLSearchParams({
      league,
      amostra: String(p.amostra ?? 10),
      periodo: p.periodo ?? "total",
      lado: p.lado ?? "todos",
    });
    fetch(`/api/matches/${matchId}/tendencias?${qs.toString()}`)
      .then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (!vivo) return;
        if (!ok) throw new Error(body?.error || "Não foi possível calcular as tendências.");
        memo.set(key, body as TendenciasResp);
        setRemoto({ key, data: body as TendenciasResp, error: null });
      })
      .catch((e) => {
        if (vivo) setRemoto({ key, data: null, error: e instanceof Error ? e.message : "Falha ao carregar." });
      });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const atual = remoto.key === key ? remoto : null;
  const data = doCache ?? atual?.data ?? null;
  const error = doCache ? null : (atual?.error ?? null);
  const loading = doCache === null && atual === null;

  return { data, loading, error };
}

export type { Sequencia };
