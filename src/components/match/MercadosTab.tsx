"use client";
import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, TrendingUp } from "lucide-react";
import { PISO_PROB_MERCADO, evPct, type MercadoProb } from "@/lib/mercadosPoisson";

type Team = { id: string; name: string };

type Resposta = {
  mercados: MercadoProb[];
  melhores: MercadoProb[];
  amostra?: { casa: number; fora: number };
  fonte?: string;
  error?: string;
};

const GRUPOS: { id: MercadoProb["grupo"]; titulo: string }[] = [
  { id: "gols", titulo: "Gols" },
  { id: "gols_1t", titulo: "1º tempo · gols" },
  { id: "escanteios", titulo: "Escanteios" },
];

const pct = (p: number | null) => (p == null ? "—" : `${Math.round(p * 100)}%`);

/** Cor da probabilidade — mesma régua de 70/75 do resto do app. */
function corProb(p: number | null): string {
  if (p == null) return "text-mut";
  if (p >= 0.75) return "text-acc";
  if (p >= PISO_PROB_MERCADO) return "text-emerald-400";
  return "text-warn";
}

function CardMercado({ m, odd }: { m: MercadoProb; odd?: number | null }) {
  const ev = m.prob != null && odd != null ? evPct(m.prob, odd) : null;
  return (
    <div className="rounded-xl border border-line bg-panel p-2.5 space-y-1.5 min-w-0">
      <div className="flex items-start justify-between gap-1.5">
        <span className="text-[11px] font-extrabold text-ink leading-snug break-words min-w-0">
          {m.rotulo}
        </span>
        <span className={`text-sm font-extrabold tabular-nums shrink-0 ${corProb(m.prob)}`}>
          {pct(m.prob)}
        </span>
      </div>

      {m.prob != null && (
        <div className="h-1 rounded-full bg-line overflow-hidden">
          <div
            className={`h-full ${m.prob >= 0.75 ? "bg-acc" : m.prob >= PISO_PROB_MERCADO ? "bg-emerald-400" : "bg-warn"}`}
            style={{ width: `${Math.round(m.prob * 100)}%` }}
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-1 text-[9px] text-mut tabular-nums">
        <span className="truncate">
          {m.linha > 0 ? `Over ${m.linha}` : "Probabilidade"}
          {m.lambda != null ? ` · λ ${m.lambda.toFixed(2)}` : ""}
        </span>
        <span className="shrink-0">{m.amostra > 0 ? `${m.amostra}j` : "—"}</span>
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        {m.estimado && (
          <span className="text-[8px] font-bold bg-warn/15 text-warn px-1.5 py-0.5 rounded">ESTIMADO</span>
        )}
        {ev != null && (
          <span className={`inline-flex items-center gap-0.5 text-[8px] font-bold px-1.5 py-0.5 rounded ${ev > 0 ? "bg-acc/15 text-acc" : "bg-panel2 text-mut"}`}>
            <TrendingUp size={9} /> EV {ev >= 0 ? "+" : ""}{ev.toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Aba "MERCADOS" — Radar de Oportunidades do jogo.
 *
 * Mostra por padrão só o que passou o filtro (probabilidade > 70% ou EV
 * positivo). O toggle revela todos os mercados, inclusive os "sem dados", para
 * o usuário ver que a fonte não publicou a coluna em vez de achar que o mercado
 * não existe. Layout em 1 coluna no celular (360px) e 2 a partir de `sm`.
 */
export default function MercadosTab({
  matchId,
  league,
  home,
  away,
  odds,
}: {
  matchId: string;
  league: string;
  home: Team;
  away: Team;
  odds?: { btts?: number | null } | null;
}) {
  const [data, setData] = useState<Resposta | null>(null);
  const [erro, setErro] = useState("");
  const [verTodos, setVerTodos] = useState(false);

  useEffect(() => {
    let vivo = true;
    const qs = new URLSearchParams({ league, home: home.id, away: away.id });
    fetch(`/api/matches/${matchId}/markets?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Resposta) => {
        if (!vivo) return;
        if (j.error) setErro(j.error);
        setData(j);
      })
      .catch(() => {
        if (vivo) setErro("Não foi possível carregar os mercados agora.");
      });
    return () => {
      vivo = false;
    };
  }, [matchId, league, home.id, away.id]);

  const oddsPorId = useMemo(() => ({ btts: odds?.btts ?? null }), [odds?.btts]);
  const lista = verTodos ? data?.mercados ?? [] : data?.melhores ?? [];
  const abaixoDoPiso = (data?.mercados ?? []).filter((m) => !(m.prob != null && m.prob >= PISO_PROB_MERCADO)).length;

  if (erro) {
    return (
      <div className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-[11px] text-danger">
        {erro}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-2">
        <div className="skeleton h-16" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-20" />)}
        </div>
        <p className="text-[10px] text-mut text-center">Calculando Poisson sobre os últimos 10 jogos reais…</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-line bg-gradient-to-br from-acc/10 via-panel to-panel p-3">
        <p className="text-[10px] font-extrabold uppercase tracking-wide text-acc">Radar de mercados</p>
        <p className="text-[10px] text-mut mt-1 leading-snug">
          Probabilidade Poisson sobre os últimos {data.amostra?.casa ?? 0} jogos do mandante e{" "}
          {data.amostra?.fora ?? 0} do visitante (fonte {data.fonte ?? "ESPN"}). Só aparece o que passa de{" "}
          {Math.round(PISO_PROB_MERCADO * 100)}% ou tem EV positivo.
        </p>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center rounded-full border border-acc/40 bg-acc/10 px-2 py-0.5 text-[9px] font-extrabold text-acc">
            {data.melhores.length} oportunidade{data.melhores.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={() => setVerTodos((v) => !v)}
            aria-pressed={verTodos}
            className={`inline-flex items-center gap-1 h-7 rounded-full border px-2.5 text-[9px] font-extrabold ${
              verTodos ? "border-acc text-acc bg-acc/10" : "border-line text-mut bg-panel2"
            }`}
          >
            {verTodos ? <Eye size={11} /> : <EyeOff size={11} />}
            {verTodos ? "Só as melhores" : `Ver todos (${abaixoDoPiso} abaixo do piso)`}
          </button>
        </div>
      </div>

      {lista.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-panel p-6 text-center">
          <p className="text-[12px] font-bold text-ink">Nenhum mercado passou o filtro.</p>
          <p className="text-[10px] text-mut mt-1">
            Nenhuma linha ficou acima de {Math.round(PISO_PROB_MERCADO * 100)}% e não há odd de mercado
            para calcular EV. Toque em "Ver todos" para inspecionar as probabilidades.
          </p>
        </div>
      ) : (
        GRUPOS.map((grupo) => {
          const itens = lista.filter((m) => m.grupo === grupo.id);
          if (!itens.length) return null;
          return (
            <section key={grupo.id} className="space-y-1.5">
              <h3 className="text-[10px] font-extrabold uppercase tracking-wide text-mut">{grupo.titulo}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {itens.map((m) => (
                  <CardMercado key={m.id} m={m} odd={oddsPorId[m.id as keyof typeof oddsPorId] ?? null} />
                ))}
              </div>
            </section>
          );
        })
      )}

      <p className="text-[9px] text-mut leading-relaxed">
        Não é odd nem promessa de acerto. Os mercados de escanteios do 1º tempo são <b>estimados</b> a
        partir do total do jogo, porque a fonte não publica escanteios por tempo. Os de gols do 1º tempo
        usam os eventos reais (gols do primeiro tempo) do histórico.
      </p>
    </div>
  );
}
