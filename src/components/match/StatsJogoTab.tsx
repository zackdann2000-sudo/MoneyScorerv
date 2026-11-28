"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Crest, SourceFoot } from "@/components/ui";

type Team = { id: string; name: string; logo: string };

/* =============================================================================
   ABA "CANTOS & CARTÕES" — duas perguntas diferentes, lado a lado:
   1. NESTE JOGO: quantos escanteios/cartões cada time fez (dado da partida).
   2. HISTÓRICO: em quantos dos últimos N jogos cada time bateu a linha
      (frequência por mercado, motor `lib/screener`).

   Regra de ouro: o que a fonte não publicou aparece como "sem dados". Nenhuma
   linha é preenchida com zero, e mercado sem cobertura simplesmente não entra.
   ========================================================================== */

const ORDEM = [
  { id: "cantos_time_4_5", label: "Escanteios do time", sufixo: "4.5" },
  { id: "cantos_jogo_9_5", label: "Escanteios do jogo", sufixo: "9.5" },
  { id: "cards_ambos_1_5", label: "Cartões do time", sufixo: "1.5" },
  { id: "impedimentos_1_5", label: "Impedimentos do time", sufixo: "1.5" },
];

function Bolinhas({ serie }: { serie: (0 | 1)[] }) {
  if (!serie.length) return <span className="text-[10px] text-mut">—</span>;
  return (
    <div className="flex gap-1">
      {serie.map((v, i) => (
        <span
          key={i}
          title={v ? "bateu" : "não bateu"}
          className={`w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center ${v ? "bg-acc text-black" : "bg-panel2 text-mut border border-line"}`}
        >
          {v ? "✓" : "·"}
        </span>
      ))}
    </div>
  );
}

export default function StatsJogoTab({
  matchId,
  league,
  home,
  away,
}: {
  matchId: string;
  league: string;
  home: Team;
  away: Team;
}) {
  const [jogo, setJogo] = useState<any>(null);
  const [amostra, setAmostra] = useState<5 | 10>(10);

  /* A resposta da frequência guarda a chave do pedido (jogo|liga|amostra): ao
     trocar a amostra, o resultado antigo deixa de valer por DERIVAÇÃO (volta ao
     esqueleto) sem `setState` síncrono no corpo do efeito. */
  const chaveFreq = `${matchId}|${league}|${amostra}`;
  const [freqEstado, setFreqEstado] = useState<{ chave: string; freq: any; erro: string | null } | null>(null);
  const atualFreq = freqEstado?.chave === chaveFreq ? freqEstado : null;
  const freq = atualFreq?.freq ?? null;
  const erro = atualFreq?.erro ?? null;

  useEffect(() => {
    let on = true;
    fetch(`/api/matches/${matchId}/frequencia?league=${encodeURIComponent(league)}&amostra=${amostra}`)
      .then((r) => r.json())
      .then((j) => {
        if (!on) return;
        setFreqEstado(j?.error ? { chave: chaveFreq, freq: null, erro: String(j.error) } : { chave: chaveFreq, freq: j, erro: null });
      })
      .catch(() => {
        if (on) setFreqEstado({ chave: chaveFreq, freq: null, erro: "Não foi possível carregar a frequência agora." });
      });
    return () => {
      on = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, league, amostra]);

  /* Stats do jogo (cantos/cartões reais). Fonte pode não ter publicado — aí o
     bloco inteiro some, em vez de mostrar zeros. */
  useEffect(() => {
    let on = true;
    fetch(`/api/matches/${matchId}/team-stats?league=${encodeURIComponent(league)}`)
      .then((r) => r.json())
      .then((j) => on && setJogo(j))
      .catch(() => {});
    return () => {
      on = false;
    };
  }, [matchId, league]);

  const doJogo = (jogo?.metrics || []).filter((m: any) =>
    ["corner_kicks", "yellow_cards", "red_cards", "offsides"].includes(m.key)
  );

  const mercados: any[] = freq?.avaliacao?.mercados || [];
  const semDado: string[] = freq?.avaliacao?.semDado || [];
  const rotulo = (id: string) => ORDEM.find((o) => o.id === id)?.label || id;

  return (
    <div className="space-y-4">
      {/* ---------- 1. Neste jogo ---------- */}
      {doJogo.length > 0 && (
        <section>
          <h3 className="font-display text-[10px] font-black uppercase tracking-wide text-mut mb-1.5 px-0.5">Neste jogo</h3>
          <div className="bg-panel border border-line rounded-2xl p-3 space-y-2">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 pb-2 border-b border-line">
              <div className="flex items-center gap-1.5 min-w-0"><Crest src={home.logo} size={20} /><span className="text-[11px] font-bold truncate">{home.name}</span></div>
              <span className="text-[9px] text-mut uppercase font-bold">vs</span>
              <div className="flex items-center gap-1.5 min-w-0 justify-end"><span className="text-[11px] font-bold truncate">{away.name}</span><Crest src={away.logo} size={20} /></div>
            </div>
            {doJogo.map((m: any) => (
              <div key={m.key} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <span className="text-right font-display font-bold text-base">{m.percent ? `${Math.round(m.home)}%` : Math.round(m.home)}</span>
                <span className="text-[10px] text-mut font-bold uppercase text-center">{m.label}</span>
                <span className="font-display font-bold text-base">{m.percent ? `${Math.round(m.away)}%` : Math.round(m.away)}</span>
              </div>
            ))}
            <p className="text-[9px] text-mut text-right">{jogo?.source ? `fonte: ${jogo.source}` : ""}</p>
          </div>
        </section>
      )}

      {/* ---------- 2. Histórico por mercado ---------- */}
      <section>
        <div className="flex items-center justify-between gap-2 mb-1.5 px-0.5">
          <h3 className="font-display text-[10px] font-black uppercase tracking-wide text-mut">Frequência nos últimos jogos</h3>
          <div className="flex bg-panel border border-line rounded-full p-0.5">
            {([5, 10] as const).map((n) => (
              <button
                key={n}
                onClick={() => setAmostra(n)}
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${amostra === n ? "bg-acc text-black" : "text-mut"}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {erro && <p className="text-center text-mut text-xs py-6">{erro}</p>}
        {!freq && !erro && <div className="space-y-2"><div className="skeleton h-20" /><div className="skeleton h-20" /></div>}

        {freq && (
          <div className="space-y-2">
            {ORDEM.map((o) => {
              const m = mercados.find((x) => x.id === o.id);
              const casa = m?.lados?.casa;
              const fora = m?.lados?.fora;
              const foraDoDado = semDado.includes(o.id);
              if (!m) {
                return (
                  <div key={o.id} className="bg-panel border border-line rounded-2xl px-3 py-2.5 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-mut">{o.label} +{o.sufixo}</span>
                    <span className="text-[10px] text-mut">{foraDoDado ? "sem dados" : "—"}</span>
                  </div>
                );
              }
              return (
                <div key={o.id} className="bg-panel border border-line rounded-2xl px-3 py-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-extrabold">{o.label} <span className="text-acc">+{o.sufixo}</span></p>
                    <span className={`text-[10px] font-bold ${m.aprovado ? "text-acc" : "text-mut"}`}>{m.pct == null ? "sem dados" : `${m.pct}%`}</span>
                  </div>
                  {(["casa", "fora"] as const).map((lado) => {
                    const v = m.lados[lado];
                    if (!v) return null;
                    const time = lado === "casa" ? home : away;
                    return (
                      <div key={lado} className="flex items-center gap-2">
                        <Crest src={time.logo} size={16} />
                        <span className="text-[10px] font-bold truncate w-20">{time.name}</span>
                        <span className="text-[10px] text-mut w-14">{v.pct == null ? "sem dado" : `${v.acertos}/${v.total}`}</span>
                        <Bolinhas serie={v.serie} />
                      </div>
                    );
                  })}
                  <p className="text-[9px] text-mut">{m.criterio}{freq.amostra ? ` · últimos ${freq.amostra}` : ""}</p>
                </div>
              );
            })}
            <p className="text-[9px] text-mut px-1">
              Mando: mandante em casa × visitante fora (quando há 3+ jogos assim).
              {freq.avaliacao?.mercados?.some((m: any) => m.lados?.casa?.semMando || m.lados?.fora?.semMando)
                ? " Alguns mercados usaram a amostra completa por falta de jogos no mando."
                : ""}
            </p>
          </div>
        )}
      </section>

      <SourceFoot
        fonte="ESPN"
        amostra={freq?.amostra}
        extra="Escanteios por equipe (não o total do jogo) · sem 1º tempo para cantos"
      />

      <Link href={`/times/${home.id}?league=${encodeURIComponent(league)}`} className="block text-center text-[11px] font-bold text-acc">
        Ver página do {home.name} →
      </Link>
    </div>
  );
}
