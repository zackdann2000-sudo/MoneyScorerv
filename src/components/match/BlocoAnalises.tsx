"use client";

/**
 * Bloco de 4 análises do jogo — cartões, faltas, gols e impedimentos.
 *
 * Grade 2×2 com um card por métrica. Cada card mostra, em uma linha de leitura:
 *   - o total esperado do confronto (λ) em destaque;
 *   - a meia-linha abaixo dele e a probabilidade de passar dela;
 *   - a média do mandante × a média do visitante;
 *   - a amostra usada (jogos do histórico).
 *
 * Tudo sai das médias por jogo que a tela já carrega em `/api/teams/[id]`
 * (histórico ESPN/API-Football). Quando a fonte não publica a estatística, o
 * card diz "sem dados" — nunca mostra zero, que pareceria medição.
 */
import { useMemo } from "react";
import { Flag, Footprints, Goal, Info, SquareStack } from "lucide-react";
import { blocoAnalises, type AnaliseBloco, type MediasTime, type MetricaId } from "@/lib/blocoAnalises";

const ICONES: Record<MetricaId, typeof Goal> = {
  cartoes: SquareStack,
  faltas: Footprints,
  gols: Goal,
  impedimentos: Flag,
};

const CORES: Record<MetricaId, string> = {
  cartoes: "text-amber-400",
  faltas: "text-sky-400",
  gols: "text-acc",
  impedimentos: "text-violet-400",
};

const num = (v: number | null, casas = 1) => (v == null ? "—" : v.toFixed(casas));

function Card({ item }: { item: AnaliseBloco }) {
  const Icone = ICONES[item.id];
  const cor = CORES[item.id];

  return (
    <div className="rounded-xl border border-line bg-panel p-2 space-y-1">
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 min-w-0">
          <Icone size={12} className={item.semDados ? "text-mut" : cor} />
          <span className="text-[10px] font-extrabold text-ink uppercase tracking-wide truncate">
            {item.rotulo}
          </span>
        </div>
        {item.amostra > 0 && (
          <span className="text-[9px] text-mut tabular-nums shrink-0">{item.amostra}j</span>
        )}
      </div>

      {item.semDados ? (
        <p className="text-[10px] text-mut leading-snug">Sem dados na fonte</p>
      ) : (
        <>
          <div className="flex items-baseline gap-1">
            <span className="text-base font-extrabold text-ink tabular-nums leading-none">
              {num(item.total)}
            </span>
            <span className="text-[9px] text-mut truncate">/jogo</span>
          </div>

          {item.linha == null ? (
            <p className="text-[9px] text-mut leading-none">Sem linha (média zerada)</p>
          ) : (
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-bold text-ink tabular-nums">Over {num(item.linha)}</span>
              <span className={`text-[10px] font-extrabold tabular-nums ${cor}`}>
                {item.prob == null ? "—" : `${Math.round(item.prob)}%`}
              </span>
            </div>
          )}

          <div className="min-w-0">
            <div className="h-1 rounded-full bg-line overflow-hidden">
              <div className={`h-full ${cor.replace("text-", "bg-")}`} style={{ width: `${item.prob ?? 0}%` }} />
            </div>
          </div>

          <div className="flex items-center justify-between text-[9px] text-mut tabular-nums">
            <span className="truncate">
              <b className="text-home font-bold">{num(item.mediaCasa)}</b> casa
            </span>
            <span className="truncate">
              fora <b className="text-away font-bold">{num(item.mediaFora)}</b>
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export default function BlocoAnalises({
  casa,
  fora,
  nomes,
}: {
  casa: MediasTime | null | undefined;
  fora: MediasTime | null | undefined;
  nomes?: [string, string];
}) {
  const itens = useMemo(() => blocoAnalises(casa, fora), [casa, fora]);
  const comDados = itens.filter((i) => !i.semDados).length;

  return (
    <section className="rounded-2xl border border-line bg-panel/40 p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-extrabold text-ink uppercase tracking-wide">
          4 análises do confronto
        </h3>
        <span className="text-[9px] text-mut tabular-nums">{comDados}/4 com dados</span>
      </div>

      {nomes && (
        <p className="text-[9px] text-mut leading-none truncate">
          <span className="text-home font-bold">{nomes[0]}</span>
          <span className="mx-1">×</span>
          <span className="text-away font-bold">{nomes[1]}</span>
        </p>
      )}

      <div className="grid grid-cols-2 gap-1.5">
        {itens.map((item) => (
          <Card key={item.id} item={item} />
        ))}
      </div>

      <p className="text-[9px] text-mut leading-relaxed flex items-start gap-1">
        <Info size={9} className="mt-0.5 shrink-0" />
        <span>
          Médias por jogo do histórico de cada time. <strong className="text-ink/80">Over</strong> é a
          probabilidade de passar a linha logo abaixo do total esperado (modelo de Poisson). Estimativa
          de tendência — não é odd nem promessa de acerto.
        </span>
      </p>
    </section>
  );
}
