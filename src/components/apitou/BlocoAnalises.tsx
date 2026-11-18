"use client";

/**
 * Bloco de 4 análises do jogo: gols, cartões, faltas e impedimentos.
 *
 * Mostra a estimativa do MODELO a partir das médias reais do raio-X da fonte:
 *   λ = (produção do mandante + concessão do visitante)/2
 *     + (produção do visitante + concessão do mandante)/2
 * e a probabilidade de "over" na meia-linha logo abaixo do total esperado.
 *
 * Não lê odd de mercado e não promete lucro: é leitura de tendência. Quando a
 * fonte não tem a estatística (cache antigo, time sem histórico), o card diz
 * "sem dados" em vez de mostrar zero.
 */
import { useMemo } from "react";
import { CircleDot, Flag, Footprints, Goal, Info, SquareStack } from "lucide-react";
import type { StatsTime } from "./types";
import { quatroAnalises, type AnaliseItem, type MetricaId } from "@/lib/apitou/analises";

const ICONES: Record<MetricaId, typeof Goal> = {
  gols: Goal,
  cartoes: SquareStack,
  faltas: Footprints,
  impedimentos: Flag,
};

const CORES: Record<MetricaId, string> = {
  gols: "text-acc",
  cartoes: "text-amber-400",
  faltas: "text-sky-400",
  impedimentos: "text-violet-400",
};

function pct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

function num(v: number | null, casas = 1): string {
  return v == null ? "—" : v.toFixed(casas);
}

function CardAnalise({ item }: { item: AnaliseItem }) {
  const Icone = ICONES[item.id];
  const cor = CORES[item.id];

  if (item.semDados) {
    return (
      <div className="rounded-xl border border-line bg-panel p-2 space-y-1">
        <div className="flex items-center gap-1">
          <Icone size={12} className="text-mut" />
          <span className="text-[10px] font-extrabold text-ink uppercase tracking-wide">{item.titulo}</span>
        </div>
        <p className="text-[10px] text-mut">Sem dados na fonte</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-panel p-2 space-y-1">
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 min-w-0">
          <Icone size={12} className={cor} />
          <span className="text-[10px] font-extrabold text-ink uppercase tracking-wide truncate">
            {item.titulo}
          </span>
        </div>
        <span className="text-[9px] text-mut tabular-nums shrink-0">{item.amostraCasa + item.amostraFora}j</span>
      </div>

      <div className="flex items-baseline gap-1">
        <span className="text-base font-extrabold text-ink tabular-nums leading-none">{num(item.lambda)}</span>
        <span className="text-[9px] text-mut truncate">{item.unidade}/jogo</span>
      </div>

      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] font-bold text-ink tabular-nums">
          Over {num(item.linha)}
        </span>
        <span className={`text-[10px] font-extrabold tabular-nums ${cor}`}>{pct(item.prob)}</span>
      </div>

      <div className="flex items-center gap-1 text-[9px] text-mut tabular-nums">
        <CircleDot size={8} />
        <span className="truncate">
          {num(item.mediaCasa)} × {num(item.mediaFora)}
        </span>
        {item.favorito !== "equilibrio" && (
          <span className={`ml-auto shrink-0 font-bold ${cor}`}>
            {item.favorito === "casa" ? "casa" : "fora"}
          </span>
        )}
      </div>
    </div>
  );
}

export default function BlocoAnalises({
  casa,
  fora,
}: {
  casa: StatsTime | null | undefined;
  fora: StatsTime | null | undefined;
}) {
  const itens = useMemo(() => quatroAnalises(casa, fora), [casa, fora]);
  const comDados = itens.filter((i) => !i.semDados).length;

  return (
    <section className="rounded-2xl border border-line bg-panel/40 p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[11px] font-extrabold text-ink uppercase tracking-wide">4 análises</h3>
          <p className="text-[9px] text-mut leading-none mt-0.5">baseado nos últimos 10 jogos</p>
        </div>
        <span className="text-[9px] text-mut tabular-nums">
          {comDados}/4 com dados
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {itens.map((item) => (
          <CardAnalise key={item.id} item={item} />
        ))}
      </div>

      <p className="text-[9px] text-mut leading-relaxed flex items-start gap-1">
        <Info size={9} className="mt-0.5 shrink-0" />
        <span>
          Média de produção do time cruzada com o que o adversário concede, <strong className="text-ink/80">baseada
          nos últimos 10 jogos</strong> (peso 1.5 nos 3 mais recentes, 1.0 do 4º ao 7º, 0.5 do 8º ao 10º).
          <strong className="text-ink/80"> Over</strong> é a probabilidade de passar a linha logo abaixo do
          total esperado (modelo de Poisson). Não é odd nem promessa de acerto.
        </span>
      </p>
    </section>
  );
}
