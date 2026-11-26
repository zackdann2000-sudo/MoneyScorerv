"use client";

import { useMemo } from "react";
import { CheckCircle2, Info } from "lucide-react";
import { tendenciasDoResumo, type SerieApitou } from "@/lib/apitou/paraTendencias";
import type { Tendencia } from "@/lib/tendencias";

/**
 * Aba "Tendências" do módulo /apitou — alimentada SÓ pelo cache da fonte.
 *
 * Custo de API: zero. É a versão de bolso do motor: usa a série dos últimos
 * jogos que já está no banco (gols, faltas, cartões, impedimentos). Escanteios
 * e finalizações por jogo não existem nessa série, então essas métricas
 * simplesmente não aparecem — não são estimadas.
 *
 * A amostra fica sempre à vista: aqui é comum ter 3 a 6 jogos, e esconder isso
 * seria vender "10 jogos" sem ter 10.
 */

function linhaBR(l: number): string {
  return String(l).replace(".", ",");
}

function Item({ t }: { t: Tendencia }) {
  return (
    <li className="border-b border-line/60 py-2 last:border-0">
      <div className="flex items-center gap-1.5">
        <span
          className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-black tabular-nums ${
            t.cemPorCento ? "bg-acc text-bg" : t.pct >= 60 ? "bg-acc/15 text-acc" : "bg-panel2 text-mut"
          }`}
        >
          {t.pct}%
        </span>
        {t.cemPorCento && <CheckCircle2 size={9} className="text-acc" />}
        {t.amostraCurta && (
          <span className="rounded-full border border-warn/40 bg-warn/10 px-1.5 py-0.5 text-[8.5px] font-bold text-warn">
            amostra curta
          </span>
        )}
      </div>
      <p className="mt-1 text-[11.5px] font-extrabold leading-tight text-ink">
        {t.metrica === "btts" ? "Ambas marcam" : `${t.rotulo} · mais de ${linhaBR(t.linha)}`}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-[3px]">
        {t.serie.map((v, i) => (
          <span key={i} className={`h-1.5 w-1.5 rounded-full ${v ? "bg-acc" : "bg-line"}`} />
        ))}
        <span className="ml-1 text-[9.5px] tabular-nums text-mut">
          bateu <b className="text-ink">{t.hit}</b> de <b className="text-ink">{t.n}</b>
        </span>
      </div>
    </li>
  );
}

export default function TendenciasApitou({
  casa,
  fora,
  homeNome,
  awayNome,
}: {
  casa: SerieApitou | null | undefined;
  fora: SerieApitou | null | undefined;
  homeNome: string;
  awayNome: string;
}) {
  const { tendencias, casaJogos, foraJogos } = useMemo(() => tendenciasDoResumo(casa, fora), [casa, fora]);

  if (!casaJogos && !foraJogos) {
    return (
      <div className="rounded-2xl border border-line bg-panel p-4 text-center">
        <p className="text-[11px] font-bold text-ink">Sem série histórica neste jogo</p>
        <p className="mt-1 text-[10px] leading-relaxed text-mut">
          A fonte não devolveu o raio-x dos times. Nada é estimado no lugar do dado.
        </p>
      </div>
    );
  }

  const cem = tendencias.filter((t) => t.cemPorCento).length;

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-line bg-panel2 px-2.5 py-2">
        <p className="flex items-center gap-1.5 text-[10px] font-bold text-ink">
          <Info size={10} className="shrink-0 text-acc" />
          Amostra real: <b className="text-acc tabular-nums">{casaJogos}</b> jogo
          {casaJogos === 1 ? "" : "s"} do {homeNome.slice(0, 18)} ·{" "}
          <b className="text-acc tabular-nums">{foraJogos}</b> do {awayNome.slice(0, 18)}
        </p>
        <p className="mt-1 text-[9.5px] leading-relaxed text-mut">
          Gols, faltas, cartões e impedimentos por jogo. Escanteios e finalizações não
          vêm nesta série — por isso não aparecem aqui. Mercado com menos de 3 jogos
          fica de fora.
        </p>
      </div>

      {tendencias.length === 0 ? (
        <div className="rounded-2xl border border-line bg-panel p-4 text-center">
          <p className="text-[11px] font-bold text-ink">Sem histórico suficiente</p>
          <p className="mt-1 text-[10px] text-mut">É preciso pelo menos 3 jogos de cada lado.</p>
        </div>
      ) : (
        <section className="rounded-2xl border border-line bg-panel p-3">
          <header className="flex items-center justify-between pb-1">
            <h3 className="text-[10px] font-black uppercase tracking-wide text-mut">
              {tendencias.length} tendência{tendencias.length === 1 ? "" : "s"}
            </h3>
            {cem > 0 && (
              <span className="rounded-full bg-acc px-2 py-0.5 text-[9px] font-black text-bg">
                {cem} em 100%
              </span>
            )}
          </header>
          <ul>
            {tendencias.map((t) => (
              <Item key={t.id} t={t} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
