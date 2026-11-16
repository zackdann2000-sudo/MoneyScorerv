"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Activity, ChevronDown, Users, Info } from "lucide-react";
import { useApi } from "./useApi";
import type { JogoResp, PropAnalisada } from "./types";
import {
  ErrorBox,
  EmptyBox,
  Spinner,
  FonteBadge,
  NivelBadge,
  EdgeText,
  ProbBar,
  QiPill,
  ValorPill,
  horaJogo,
} from "./Ui";

/**
 * Aba "Análise" — o jogo aberto, com o que o modelo calculou.
 *
 * Consome GET /api/apitou/jogo/[id]. Duas visões:
 *  - Desajustes: onde o modelo vê mais chance que o mercado paga (o achado).
 *  - Props: todas as linhas, ordenadas por valor.
 */
export default function AnaliseTab({
  jogoId,
  onVoltar,
}: {
  jogoId: number;
  onVoltar: () => void;
}) {
  const url = useMemo(() => `/api/apitou/jogo/${jogoId}`, [jogoId]);
  const { data, loading, error, refresh } = useApi<JogoResp>(url, [jogoId]);

  const [modo, setModo] = useState<"desajustes" | "props" | "contexto">("desajustes");
  const [mercado, setMercado] = useState<string>("");

  const propsFiltradas = useMemo(() => {
    if (!data) return [] as PropAnalisada[];
    return mercado ? data.props.filter((p) => p.mercadoRotulo === mercado) : data.props;
  }, [data, mercado]);

  if (loading && !data) return <Spinner label="Calculando análise…" />;
  if (error) return <ErrorBox message={error} onRetry={() => refresh()} />;
  if (!data) return null;

  const { jogo } = data;

  return (
    <div className="space-y-3">
      <button
        onClick={onVoltar}
        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-mut hover:text-ink"
      >
        <ArrowLeft size={13} /> Jogos do Dia
      </button>

      {/* Cabeçalho do jogo */}
      <div className="rounded-2xl border border-line bg-panel p-3 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold text-mut uppercase tracking-wide truncate">
            {jogo.competicao}
          </span>
          <span className="text-[10px] font-bold text-acc tabular-nums shrink-0">
            {horaJogo(jogo.kickoff)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 text-sm font-extrabold text-ink">
          <span className="flex-1 truncate">{jogo.home}</span>
          <span className="text-[10px] text-mut shrink-0">×</span>
          <span className="flex-1 truncate text-right">{jogo.away}</span>
        </div>
        {jogo.arbitro && (
          <p className="text-[10px] text-mut">
            Árbitro: {jogo.arbitro.nome} · {jogo.arbitro.amarelos.toFixed(2)} amarelos/jogo
          </p>
        )}
      </div>

      {/* Alternador de visão */}
      <nav className="flex gap-1.5 p-1 rounded-2xl bg-panel border border-line">
        {(
          [
            ["desajustes", "Desajustes", data.totais.desajustes],
            ["props", "Props", data.totais.props],
            ["contexto", "Contexto", 0],
          ] as const
        ).map(([key, label, n]) => (
          <button
            key={key}
            onClick={() => setModo(key)}
            className={`flex-1 h-9 rounded-xl text-[11px] font-extrabold inline-flex items-center justify-center gap-1 transition-colors ${
              modo === key ? "bg-acc text-bg" : "text-mut"
            }`}
          >
            {label}
            {n > 0 && (
              <span className={`text-[9px] ${modo === key ? "text-bg/70" : "text-mut/70"}`}>({n})</span>
            )}
          </button>
        ))}
      </nav>

      {modo === "desajustes" && <ListaDesajustes data={data} />}
      {modo === "props" && (
        <ListaProps
          props={propsFiltradas}
          mercados={data.mercadosDisponiveis}
          mercado={mercado}
          setMercado={setMercado}
        />
      )}
      {modo === "contexto" && <Contexto data={data} />}

      <FonteBadge geradoEm={data.geradoEm} stale={data.stale} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Desajustes do jogo                                                 */
/* ------------------------------------------------------------------ */

function ListaDesajustes({ data }: { data: JogoResp }) {
  if (!data.desajustes.length) {
    return (
      <EmptyBox>
        Nenhum desajuste relevante neste jogo. O mercado está alinhado com o modelo — o que
        também é informação.
      </EmptyBox>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-[10px] text-mut leading-relaxed flex items-start gap-1">
        <Info size={11} className="mt-0.5 shrink-0" />
        Onde o modelo vê mais chance do que a odd paga. Verde escuro = mercado pagando a mais.
      </p>
      <ul className="space-y-2">
        {data.desajustes.map((d) => (
          <li key={d.chave} className="rounded-2xl border border-line bg-panel p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-ink truncate">{d.jogador}</p>
                <p className="text-[10px] text-mut">
                  {d.mercado} · acima de {d.linha}
                </p>
              </div>
              <div className="text-right shrink-0">
                <NivelBadge nivel={d.nivel} />
                <p className="text-[10px] text-mut mt-1 tabular-nums">odd {d.odd.toFixed(2)}</p>
              </div>
            </div>

            <ProbBar modelo={d.probModelo} mercado={d.probMercado} />

            <div className="flex items-center justify-between pt-1 border-t border-line/60">
              <span className="text-[10px] text-mut">
                vantagem <EdgeText edge={d.edge} />
              </span>
              <span className="inline-flex items-center gap-3">
                <QiPill qi={d.qi} />
                <ValorPill valor={d.valor} />
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Todas as props                                                     */
/* ------------------------------------------------------------------ */

function ListaProps({
  props,
  mercados,
  mercado,
  setMercado,
}: {
  props: PropAnalisada[];
  mercados: string[];
  mercado: string;
  setMercado: (m: string) => void;
}) {
  const [aberto, setAberto] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {mercados.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          <button
            onClick={() => setMercado("")}
            className={`shrink-0 px-3 h-7 rounded-lg border text-[10px] font-bold ${
              mercado === "" ? "bg-acc text-bg border-acc" : "bg-panel border-line text-ink"
            }`}
          >
            Todos
          </button>
          {mercados.map((m) => (
            <button
              key={m}
              onClick={() => setMercado(mercado === m ? "" : m)}
              className={`shrink-0 px-3 h-7 rounded-lg border text-[10px] font-bold ${
                mercado === m ? "bg-acc text-bg border-acc" : "bg-panel border-line text-ink"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      {props.length === 0 ? (
        <EmptyBox>Nenhuma prop neste filtro.</EmptyBox>
      ) : (
        <ul className="space-y-1.5">
          {props.map((p) => {
            const expandido = aberto === p.chave;
            return (
              <li key={p.chave} className="rounded-xl border border-line bg-panel overflow-hidden">
                <button
                  onClick={() => setAberto(expandido ? null : p.chave)}
                  className="w-full text-left p-2.5 flex items-center gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-ink truncate">
                      {p.jogador}
                      {p.time && <span className="text-mut font-normal"> · {p.time}</span>}
                    </p>
                    <p className="text-[10px] text-mut truncate">
                      {p.mercadoRotulo} · acima de {p.linha} · odd{" "}
                      <span className="text-ink tabular-nums">{p.odd.toFixed(2)}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="text-right">
                      <span className="block text-[8px] font-bold text-mut uppercase">prob</span>
                      <span className="text-xs font-extrabold text-acc tabular-nums">
                        {Math.round(p.probModelo * 100)}%
                      </span>
                    </span>
                    <QiPill qi={p.qi} />
                    <ChevronDown
                      size={13}
                      className={`text-mut transition-transform ${expandido ? "rotate-180" : ""}`}
                    />
                  </div>
                </button>

                {expandido && (
                  <div className="px-2.5 pb-2.5 pt-0 space-y-2 border-t border-line/60">
                    <ProbBar modelo={p.probModelo} mercado={p.probModelo / (1 + p.edge)} />
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <Metrica rotulo="lambda (média)" valor={p.mediaBase.toFixed(2)} />
                      <Metrica rotulo="amostra" valor={`${p.amostra}j`} />
                      <Metrica rotulo="confiança" valor={`${p.confianca.toFixed(0)}`} />
                    </div>
                    <p className="text-[9px] text-mut leading-relaxed">
                      Poisson com λ = {p.mediaBase.toFixed(2)}. A probabilidade acima é de o evento
                      passar de {p.linha} (não de acertar exatamente).
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Metrica({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-lg bg-panel2 py-1.5">
      <span className="block text-[8px] font-bold text-mut uppercase tracking-wide">{rotulo}</span>
      <span className="text-[11px] font-extrabold text-ink tabular-nums">{valor}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Contexto (forma, H2H, escalação)                                    */
/* ------------------------------------------------------------------ */

function Contexto({ data }: { data: JogoResp }) {
  const { jogo } = data;
  const linhas = [
    ["Gols marcados", jogo.statsHome?.gols, jogo.statsAway?.gols],
    ["Gols sofridos", jogo.statsHome?.golsSof, jogo.statsAway?.golsSof],
    ["Escanteios", jogo.statsHome?.cantos, jogo.statsAway?.cantos],
    ["Finalizações", jogo.statsHome?.fin, jogo.statsAway?.fin],
    ["Chutes a gol", jogo.statsHome?.chutesGol, jogo.statsAway?.chutesGol],
    ["Faltas", jogo.statsHome?.faltas, jogo.statsAway?.faltas],
    ["Amarelos", jogo.statsHome?.amarelos, jogo.statsAway?.amarelos],
    ["Posse (%)", jogo.statsHome?.posse, jogo.statsAway?.posse],
  ] as const;

  return (
    <div className="space-y-3">
      {jogo.statsHome && jogo.statsAway && (
        <div className="rounded-2xl border border-line bg-panel p-3 space-y-2">
          <p className="text-[10px] font-bold text-mut uppercase tracking-wide flex items-center gap-1">
            <Activity size={11} /> Médias ({jogo.statsHome.jogos} jogos)
          </p>
          <div className="grid grid-cols-[1fr_auto_1fr] gap-x-2 gap-y-1 text-[11px]">
            <span className="text-ink font-bold truncate text-right">{jogo.home}</span>
            <span className="text-[9px] text-mut uppercase">vs</span>
            <span className="text-ink font-bold truncate">{jogo.away}</span>
            {linhas.map(([rotulo, h, a]) => (
              <div key={rotulo} className="contents">
                <span className="text-right tabular-nums text-acc font-bold">
                  {h == null ? "—" : h.toFixed(1)}
                </span>
                <span className="text-[9px] text-mut text-center whitespace-nowrap">{rotulo}</span>
                <span className="tabular-nums text-acc font-bold">{a == null ? "—" : a.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {jogo.h2hResumo.length > 0 && (
        <div className="rounded-2xl border border-line bg-panel p-3 space-y-1.5">
          <p className="text-[10px] font-bold text-mut uppercase tracking-wide">Confrontos diretos</p>
          {jogo.h2hResumo.map((h, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-mut tabular-nums shrink-0">{h.ts.slice(0, 7)}</span>
              <span className="flex-1 truncate text-ink">{h.casa}</span>
              <span className="font-extrabold tabular-nums text-acc shrink-0">
                {h.golsCasa}–{h.golsFora}
              </span>
              <span className="flex-1 truncate text-ink text-right">{h.fora}</span>
            </div>
          ))}
        </div>
      )}

      {(jogo.escHome || jogo.escAway) && (
        <div className="rounded-2xl border border-line bg-panel p-3 space-y-2">
          <p className="text-[10px] font-bold text-mut uppercase tracking-wide flex items-center gap-1">
            <Users size={11} /> Última escalação
          </p>
          <div className="grid grid-cols-2 gap-3">
            {[jogo.escHome, jogo.escAway].map((e, i) =>
              e ? (
                <div key={i} className="min-w-0">
                  <p className="text-[10px] font-bold text-acc mb-1">
                    {e.formacao} <span className="text-mut font-normal">vs {e.adversario}</span>
                  </p>
                  <ul className="space-y-0.5">
                    {e.xi.slice(0, 11).map((p) => (
                      <li key={p.num} className="text-[9px] text-mut truncate">
                        <span className="text-ink/60 tabular-nums">{p.num}</span> {p.nome}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null,
            )}
          </div>
        </div>
      )}
    </div>
  );
}