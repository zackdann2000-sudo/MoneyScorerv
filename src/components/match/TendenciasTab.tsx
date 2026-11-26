"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, RefreshCw } from "lucide-react";
import type { Periodo } from "@/lib/tendencias";
import { QuentesBlock } from "./QuentesBlock";
import { useTendencias, type TendenciaItem, type TendenciasResp } from "./useTendencias";

/**
 * Aba "TENDÊNCIAS" — o motor "bateu X de Y nos últimos N jogos".
 *
 * Princípio de tela: o número que aparece é sempre acompanhado da amostra que
 * o sustenta. "Bateu 10 de 10" só existe porque havia 10 jogos; com 4, aparece
 * como amostra curta e sem selo. Nada de 0% para mercado sem dado — mercado sem
 * dado não é renderizado.
 */

const PERIODOS: { id: Periodo; label: string }[] = [
  { id: "total", label: "Partida" },
  { id: "1t", label: "1º tempo" },
  { id: "2t", label: "2º tempo" },
];

const AMOSTRAS = [5, 10, 15];

/** "9.5" → "9,5" (padrão pt-BR em linha de mercado). */
function linhaBR(l: number): string {
  return String(l).replace(".", ",");
}

/** Rótulo humano de uma tendência, sem inventar unidade que não temos. */
function rotuloDe(t: TendenciaItem): string {
  const periodo = t.periodo === "1t" ? " · 1º tempo" : t.periodo === "2t" ? " · 2º tempo" : "";
  if (t.metrica === "btts") return `Ambas marcam${periodo}`;
  const dir = t.dir === "under" ? "menos de" : "mais de";
  return `${t.rotulo}${periodo} · ${dir} ${linhaBR(t.linha)}`;
}

/** Bolinhas 0/1 — verde bateu, cinza não. Ordem cronológica. */
function Bolinhas({ serie }: { serie: (0 | 1)[] }) {
  return (
    <div className="flex flex-wrap items-center gap-[3px]" aria-hidden>
      {serie.map((v, i) => (
        <span
          key={i}
          title={`${i + 1}º mais antigo: ${v ? "bateu" : "não bateu"}`}
          className={`h-1.5 w-1.5 rounded-full ${v ? "bg-acc" : "bg-line"}`}
        />
      ))}
    </div>
  );
}

function Item({ t, homeNome, awayNome }: { t: TendenciaItem; homeNome: string; awayNome: string }) {
  const lado = t.lado === "casa" ? homeNome : t.lado === "fora" ? awayNome : null;
  return (
    <li className="border-b border-line/60 py-2 last:border-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-black tabular-nums ${
                t.cemPorCento
                  ? "bg-acc text-black"
                  : t.destaque
                    ? "bg-acc/15 text-acc"
                    : "bg-panel2 text-mut"
              }`}
            >
              {t.pct}%
            </span>
            {t.cemPorCento && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase text-acc">
                <CheckCircle2 size={9} /> 100%
              </span>
            )}
            {t.amostraCurta && (
              <span className="inline-flex items-center gap-0.5 rounded-full border border-warn/40 bg-warn/10 px-1.5 py-0.5 text-[8.5px] font-bold text-warn">
                <AlertTriangle size={8} /> amostra curta
              </span>
            )}
          </div>
          <p className="text-[11.5px] font-extrabold leading-tight text-ink">
            {lado && <span className="text-mut">{lado} · </span>}
            {rotuloDe(t)}
          </p>
          <div className="flex items-center gap-2">
            <Bolinhas serie={t.serie} />
            <span className="text-[9.5px] text-mut tabular-nums">
              bateu <b className="text-ink">{t.hit}</b> de <b className="text-ink">{t.n}</b>
              {" · "}mediana {linhaBR(t.mediana)}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}

function CabecalhoAmostra({ d, homeNome, awayNome }: { d: TendenciasResp; homeNome: string; awayNome: string }) {
  const { casa, fora } = d.fontes;
  const pior = Math.min(d.resumo.casaJogos, d.resumo.foraJogos);
  return (
    <div className="rounded-xl border border-line bg-panel2 px-2.5 py-2 space-y-1">
      <div className="flex items-center gap-1.5">
        <Info size={10} className="shrink-0 text-acc" />
        <p className="text-[10px] font-bold text-ink">
          Amostra real: <b className="text-acc tabular-nums">{d.resumo.casaJogos}</b> jogos do {homeNome} ·{" "}
          <b className="text-acc tabular-nums">{d.resumo.foraJogos}</b> do {awayNome}
        </p>
      </div>
      <p className="text-[9.5px] leading-relaxed text-mut">
        {d.resumo.suficiente
          ? `Contamos jogo a jogo o que realmente aconteceu (${casa.fonte}). Mercado com menos de 3 jogos não aparece — não mostramos 0% para falta de dado.`
          : `Um dos times tem menos de 3 jogos no histórico da fonte. Sem isso não publicamos tendência (${pior} jogo${pior === 1 ? "" : "s"}).`}
      </p>
    </div>
  );
}

export function TendenciasTab({
  matchId,
  league,
  homeNome,
  awayNome,
}: {
  matchId: string;
  league: string;
  homeNome: string;
  awayNome: string;
}) {
  const [amostra, setAmostra] = useState(10);
  const [periodo, setPeriodo] = useState<Periodo>("total");
  const [lado, setLado] = useState<"todos" | "casa" | "fora">("todos");

  const { data, loading, error } = useTendencias(matchId, league, { amostra, periodo, lado });

  const lista = useMemo(() => data?.tendencias ?? [], [data]);
  const cem = lista.filter((t) => t.cemPorCento).length;
  const resto = lista.filter((t) => !t.cemPorCento);

  const chip = (on: boolean) =>
    `shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-extrabold transition-colors ${
      on ? "border-acc bg-acc text-black" : "border-line bg-panel text-mut"
    }`;

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {AMOSTRAS.map((n) => (
            <button key={n} onClick={() => setAmostra(n)} className={chip(amostra === n)}>
              Últimos {n}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {PERIODOS.map((p) => (
            <button key={p.id} onClick={() => setPeriodo(p.id)} className={chip(periodo === p.id)}>
              {p.label}
            </button>
          ))}
          <span className="mx-0.5 h-4 w-px bg-line" />
          <button onClick={() => setLado("todos")} className={chip(lado === "todos")}>
            Todos
          </button>
          <button onClick={() => setLado("casa")} className={chip(lado === "casa")}>
            {homeNome.slice(0, 12)}
          </button>
          <button onClick={() => setLado("fora")} className={chip(lado === "fora")}>
            {awayNome.slice(0, 12)}
          </button>
        </div>
      </div>

      {loading && (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-panel2" />
          ))}
        </div>
      )}

      {error && !loading && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-3">
          <p className="text-[11px] font-bold text-danger">{error}</p>
          <p className="mt-1 text-[10px] text-mut">
            Se persistir, o histórico deste time pode não estar disponível na fonte.
          </p>
        </div>
      )}

      {!loading && !error && data && (
        <>
          <CabecalhoAmostra d={data} homeNome={homeNome} awayNome={awayNome} />

          <QuentesBlock
            casa={data.quentes.casa}
            fora={data.quentes.fora}
            homeNome={homeNome}
            awayNome={awayNome}
          />

          {lista.length === 0 ? (
            <div className="rounded-2xl border border-line bg-panel p-4 text-center">
              <p className="text-[11px] font-bold text-ink">Sem histórico suficiente</p>
              <p className="mt-1 text-[10px] leading-relaxed text-mut">
                A fonte não devolveu 3 jogos ou mais para este confronto
                {periodo !== "total" ? " neste período" : ""}. Nada é estimado no lugar do dado.
              </p>
            </div>
          ) : (
            <section className="rounded-2xl border border-line bg-panel p-3">
              <header className="flex items-center justify-between gap-2 pb-1">
                <h3 className="text-[10px] font-black uppercase tracking-wide text-mut">
                  {lista.length} tendência{lista.length === 1 ? "" : "s"}
                </h3>
                {cem > 0 && (
                  <span className="rounded-full bg-acc px-2 py-0.5 text-[9px] font-black text-black">
                    {cem} em 100%
                  </span>
                )}
              </header>

              {cem > 0 && (
                <>
                  <p className="pb-1 pt-1 text-[9px] font-black uppercase tracking-wide text-acc">
                    Bateu em todos
                  </p>
                  <ul>
                    {lista
                      .filter((t) => t.cemPorCento)
                      .map((t) => (
                        <Item key={t.id} t={t} homeNome={homeNome} awayNome={awayNome} />
                      ))}
                  </ul>
                </>
              )}

              {resto.length > 0 && (
                <>
                  <p className="pb-1 pt-2 text-[9px] font-black uppercase tracking-wide text-mut">
                    Demais mercados
                  </p>
                  <ul>
                    {resto.map((t) => (
                      <Item key={t.id} t={t} homeNome={homeNome} awayNome={awayNome} />
                    ))}
                  </ul>
                </>
              )}

              <p className="flex items-start gap-1 pt-2 text-[9px] leading-relaxed text-mut/70">
                <RefreshCw size={9} className="mt-0.5 shrink-0" />
                Frequência histórica, não previsão. O que aconteceu nos últimos jogos não
                obriga o próximo a repetir.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default TendenciasTab;
