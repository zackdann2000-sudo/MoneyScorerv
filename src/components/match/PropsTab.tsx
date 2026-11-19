"use client";
import { useEffect, useMemo, useState } from "react";
import type { PropCalculada, Mercado } from "@/lib/playerPropsEngine";

type Card = { mercado: Mercado; top: PropCalculada[] };
type H2H = {
  jogos: number;
  cartoes: { mandante: number; visitante: number };
  finalizacoes: { mandante: number; visitante: number };
  fonte: string;
};
type Resposta = {
  cards: Card[];
  h2h: H2H | null;
  amostra?: { casa: number; fora: number; maxJogos: number; temporadaCasa?: number | null; temporadaFora?: number | null };
  fontes?: { casa: string | null; fora: string | null };
  semDados?: boolean;
  desativado?: boolean;
  erro?: string;
  error?: string;
};

const ICONE: Record<string, string> = {
  cartoes: "🟨",
  finalizacoes: "🎯",
  chutes_no_gol: "🥅",
  faltas_sofridas: "🦵",
  faltas_cometidas: "✋",
  gols: "⚽",
  assistencias: "🅰️",
  defesas: "🧤",
};

function Barra({ valor, cor }: { valor: number; cor: string }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-panel2 overflow-hidden">
      <div className={`h-full rounded-full ${cor}`} style={{ width: `${Math.round(Math.min(1, Math.max(0, valor)) * 100)}%` }} />
    </div>
  );
}

function LinhaProp({ p }: { p: PropCalculada }) {
  const pct = Math.round(p.probOver * 100);
  const corBarra = pct >= 70 ? "bg-emerald-400" : pct >= 55 ? "bg-acc" : "bg-warn";
  return (
    <div className="py-1.5 border-t border-line first:border-t-0">
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] font-bold text-ink truncate flex-1">{p.nome}</span>
        <span className="text-[9px] text-mut shrink-0">{p.lado === "home" ? "casa" : "fora"}</span>
        <span className={`text-[12px] font-extrabold tabular-nums shrink-0 ${pct >= 70 ? "text-emerald-400" : pct >= 55 ? "text-acc" : "text-warn"}`}>
          {pct}%
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <Barra valor={p.probOver} cor={corBarra} />
        <span className="text-[9px] text-mut tabular-nums shrink-0">
          λ {p.lambda?.toFixed(2)} · {p.amostra}j{p.mediaH2H != null ? " · H2H" : ""}
        </span>
      </div>
    </div>
  );
}

export default function PropsTab({ matchId, league, home, away }: { matchId: string; league: string; home: string; away: string }) {
  const [data, setData] = useState<Resposta | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let vivo = true;
    const qs = new URLSearchParams({ league, home, away });
    fetch(`/api/matches/${matchId}/props?${qs}`)
      .then((r) => r.json())
      .then((j) => { if (vivo) setData(j); })
      .catch(() => { if (vivo) setErro("Não foi possível carregar os props agora."); });
    return () => { vivo = false; };
  }, [matchId, league, home, away]);

  const cards = data?.cards ?? [];
  const h2h = data?.h2h ?? null;
  const resumoH2H = useMemo(() => {
    if (!h2h || !h2h.jogos) return null;
    return `Nos últimos ${h2h.jogos} confrontos, houve ${h2h.cartoes.mandante} cartões para o time mandante e ${h2h.finalizacoes.visitante} finalizações para o time visitante.`;
  }, [h2h]);

  if (erro || data?.error || data?.erro) {
    return <div className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-[11px] text-danger">{erro || data?.error || data?.erro}</div>;
  }

  return (
    <div className="space-y-2.5">
      <div className="rounded-2xl border border-line bg-gradient-to-br from-acc/10 via-panel to-panel p-3">
        <p className="text-[10px] font-extrabold uppercase tracking-wide text-acc">Player props · últimos jogos</p>
        <p className="text-[10px] text-mut mt-1">
          Poisson sobre a média ponderada (jogo recente pesa mais). H2H entra como ajuste de 30% quando existe.
        </p>
      </div>

      {resumoH2H && (
        <div className="rounded-2xl border border-warn/40 bg-warn/10 p-3">
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-warn">Resumo H2H</p>
          <p className="text-[11px] font-semibold text-ink mt-1 leading-snug">{resumoH2H}</p>
          <p className="text-[9px] text-mut mt-1 tabular-nums">
            Mandante: {h2h!.finalizacoes.mandante} finalizações · Visitante: {h2h!.cartoes.visitante} cartões
          </p>
        </div>
      )}

      {!data && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 rounded-2xl border border-line bg-panel animate-pulse" />
          ))}
          <p className="text-[10px] text-mut text-center">Buscando estatísticas individuais (pode levar alguns segundos)…</p>
        </div>
      )}

      {data && (data.semDados || !cards.length) && (
        <div className="rounded-xl border border-line bg-panel p-4 text-center">
          <p className="text-[11px] font-bold text-ink">Sem amostra suficiente para props deste jogo.</p>
          <p className="text-[10px] text-mut mt-1">
            {data.desativado
              ? "Módulo desativado por configuração (PLAYER_PROPS_DISABLED)."
              : "A API-Football não devolveu estatísticas individuais dos últimos jogos (cota ou time sem dados)."}
          </p>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {cards.map(({ mercado, top }) => (
          <div key={mercado.id} className="rounded-2xl border border-line bg-panel p-3">
            <p className="text-[11px] font-extrabold text-ink flex items-center gap-1.5">
              <span aria-hidden>{ICONE[mercado.id] ?? "📊"}</span>
              {mercado.rotulo}
              <span className="ml-auto text-[9px] font-bold text-mut">Over {mercado.linha}</span>
            </p>
            <div className="mt-1">
              {top.map((p) => <LinhaProp key={p.jogadorId} p={p} />)}
            </div>
          </div>
        ))}
      </div>

      {data?.amostra && cards.length > 0 && (
        <p className="text-[9px] text-mut text-center">
          Amostra: {data.amostra.casa} jogos (casa{data.amostra.temporadaCasa ? ` · ${data.amostra.temporadaCasa}` : ""}) ·{" "}
          {data.amostra.fora} jogos (fora{data.amostra.temporadaFora ? ` · ${data.amostra.temporadaFora}` : ""}) · cache 24h
        </p>
      )}
    </div>
  );
}