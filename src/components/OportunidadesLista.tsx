"use client";

/**
 * Lista de Oportunidades de valor com FILTRO DE MERCADO:
 * Tudo · Gols · Cartões · Escanteios.
 *
 * Recebe as oportunidades já calculadas no servidor (Value Bet) e só filtra no
 * cliente — nenhuma requisição extra. Os rótulos vêm prontos do motor.
 */
import { useMemo, useState } from "react";
import { PorqueValor } from "@/components/ValorEsperado";
import { FaixaTag, OddJustaLinha, SeloAcertos, TrustNota } from "@/components/FaixaRisco";
import type { OportunidadeValor } from "@/lib/opportunitiesEngine";

type Filtro = "tudo" | "gols" | "cartoes" | "escanteios";
type Categoria = Exclude<Filtro, "tudo">;

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Classifica o mercado do Value Bet nas três famílias pedidas. */
function categoria(mercado: string): Categoria {
  if (mercado.startsWith("cards")) return "cartoes";
  if (mercado.startsWith("corners")) return "escanteios";
  return "gols";
}

export default function OportunidadesLista({ oportunidades }: { oportunidades: OportunidadeValor[] }) {
  const [filtro, setFiltro] = useState<Filtro>("tudo");

  const conta = (c: Categoria) => oportunidades.filter((o) => categoria(o.mercado) === c).length;
  const lista = useMemo(
    () => (filtro === "tudo" ? oportunidades : oportunidades.filter((o) => categoria(o.mercado) === filtro)),
    [filtro, oportunidades],
  );

  const chips: [Filtro, string, number][] = [
    ["tudo", "Tudo", oportunidades.length],
    ["gols", "Gols", conta("gols")],
    ["cartoes", "Cartões", conta("cartoes")],
    ["escanteios", "Escanteios", conta("escanteios")],
  ];

  return (
    <section className="rounded-2xl border border-acc/40 bg-gradient-to-br from-acc/10 via-panel to-panel p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-extrabold uppercase tracking-wide text-acc">Oportunidades de valor</h2>
        <span className="text-[9px] text-mut shrink-0">modelo ≥ 65% · odd 1.45–2.50</span>
      </div>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {chips.map(([key, label, n]) => (
          <button
            key={key}
            onClick={() => setFiltro(key)}
            disabled={key !== "tudo" && n === 0}
            className={`shrink-0 h-7 px-2.5 rounded-full border text-[10px] font-bold transition-colors disabled:opacity-40 ${
              filtro === key ? "bg-acc text-bg border-acc" : "bg-panel border-line text-ink"
            }`}
          >
            {label} <span className="opacity-70">({n})</span>
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <p className="text-[10px] text-mut py-2">Nenhuma oportunidade nesta categoria hoje.</p>
      ) : (
        <ul className="space-y-1.5">
          {lista.map((o) => (
            <li key={o.chave} className="rounded-xl border border-line bg-panel2/70 px-2.5 py-2">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-bold text-ink truncate">
                    {o.home.name} × {o.away.name}
                  </span>
                  <span className="block text-[9px] text-mut truncate">
                    {o.leagueName} · {o.estado}
                  </span>
                </span>
                <span className="text-right shrink-0">
                  <span className="block text-[10px] font-extrabold text-ink">{o.rotulo}</span>
                  <span className="block text-[10px] font-extrabold text-acc tabular-nums">{pct(o.probModelo)}</span>
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <TrustNota nota={o.trust} rotulo={o.trustRotulo} amostra={o.amostra} />
                <FaixaTag faixa={o.faixa} />
                <OddJustaLinha odd={o.odd} oddJusta={o.oddJusta} margem={o.margemMercado} />
              </div>
              {o.acertosRecentes && (
                <div className="mt-1">
                  <SeloAcertos acertosRecentes={o.acertosRecentes} serie={o.serieRecente} />
                </div>
              )}
              <p className="mt-1 text-[10px] font-semibold text-mut tabular-nums">
                <PorqueValor probModelo={o.probModelo} odd={o.odd} evPct={o.evPct} />
              </p>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[8px] text-mut leading-snug">
        Valor = probabilidade do modelo − probabilidade implícita da odd (1/odd). Odd justa = odd da casa sem a
        comissão do mercado (de-vig). TRUST = nota 0–10 de confiança (probabilidade 45% + EV 35% + amostra 20%).
        Faixas: 🛡️ Favorito (odd ≥ 1.25 e prob &gt; 55%) · ⚖️ Valor (odd 1.75–2.90) · 💣 Bomba (odd &gt; 2.90 e prob
        &gt; 25%). EV positivo não é garantia de acerto.
      </p>
    </section>
  );
}
