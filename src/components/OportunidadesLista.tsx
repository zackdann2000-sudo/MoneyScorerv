"use client";

/**
 * Lista de Oportunidades de valor com FILTRO DE MERCADO:
 * Tudo · Gols · Cartões · Escanteios.
 *
 * Recebe as oportunidades já calculadas no servidor (Value Bet) e só filtra no
 * cliente — nenhuma requisição extra. Os rótulos vêm prontos do motor.
 */
import { useMemo, useState } from "react";
import { Lock } from "lucide-react";
import { useApp } from "@/context/AppContext";
import PaywallCard from "@/components/PaywallCard";
import FiltrosOportunidades, { useFiltroOportunidades } from "@/components/FiltrosOportunidades";
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
  /* QUOTA DIÁRIA: a lista libera só o que o plano do dia permite. O card
     seguinte não some — ele aparece bloqueado com o paywall, que é onde a
     conversão acontece (o usuário vê que existe valor ali). */
  const { user } = useApp();
  const quota = user?.quota;
  const liberado = !quota || quota.ilimitada ? Infinity : quota.restante;
  // Piso de 75% + chips da nata antes do filtro de mercado.
  const { filtradas, ocultasPeloPiso, contagem, mostrarAbaixoDe70, setMostrarAbaixoDe70, chips, toggleChip } =
    useFiltroOportunidades(oportunidades);

  const conta = (c: Categoria) => filtradas.filter((o) => categoria(o.mercado) === c).length;
  const listaCompleta = useMemo(
    () => (filtro === "tudo" ? filtradas : filtradas.filter((o) => categoria(o.mercado) === filtro)),
    [filtro, filtradas],
  );
  /* Corta no limite do plano: o resto vira um único card de paywall (não N
     cadeados repetidos, que só empurram a lista para baixo). */
  const lista = Number.isFinite(liberado) ? listaCompleta.slice(0, liberado) : listaCompleta;
  const bloqueadas = Number.isFinite(liberado) ? listaCompleta.length - lista.length : 0;

  const chipsMercado: [Filtro, string, number][] = [
    ["tudo", "Tudo", filtradas.length],
    ["gols", "Gols", conta("gols")],
    ["cartoes", "Cartões", conta("cartoes")],
    ["escanteios", "Escanteios", conta("escanteios")],
  ];

  return (
    <section className="rounded-2xl border border-acc/40 bg-gradient-to-br from-acc/10 via-panel to-panel p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-extrabold uppercase tracking-wide text-acc">Oportunidades de valor</h2>
        <span className="text-[9px] text-mut shrink-0">modelo ≥ 75% · odd 1.45–2.50</span>
      </div>

      <FiltrosOportunidades
        visiveis={filtradas.length}
        total={oportunidades.length}
        ocultas={ocultasPeloPiso}
        mostrarAbaixoDe70={mostrarAbaixoDe70}
        onToggleAbaixo={setMostrarAbaixoDe70}
        chips={chips}
        onToggleChip={toggleChip}
        contagem={contagem}
      />

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {chipsMercado.map(([key, label, n]) => (
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
        <p className="text-[10px] text-mut py-2">
          {oportunidades.length > 0 && filtradas.length === 0
            ? `${oportunidades.length} linha(s) ficaram abaixo de 75% ou fora dos chips. Nenhuma oportunidade de elite (75%+) encontrada para este dia/filtro. Use 'Mostrar abaixo de 75%' para ver as linhas de valor.`
            : "Nenhuma oportunidade de elite (75%+) encontrada para este dia/filtro. Use 'Mostrar abaixo de 75%' para ver as linhas de valor."}
        </p>
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

      {bloqueadas > 0 && (
        <div className="mt-1.5 space-y-2">
          {/* Teaser borrado: mostra que existe conteúdo, sem entregar o pick. */}
          <div className="rounded-xl border border-line bg-panel2/50 px-2.5 py-2 blur-[3px] select-none" aria-hidden>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2/5 rounded bg-line" />
              <span className="ml-auto h-2.5 w-10 rounded bg-line" />
            </div>
            <div className="mt-1.5 flex gap-1.5">
              <span className="h-2 w-14 rounded-full bg-line" />
              <span className="h-2 w-10 rounded-full bg-line" />
            </div>
          </div>
          <p className="flex items-center justify-center gap-1 text-[10px] font-bold text-mut">
            <Lock size={11} /> Mais {bloqueadas} análise(s) bloqueada(s) pela quota de hoje
          </p>
          <PaywallCard reason="quota" compacto />
        </div>
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
