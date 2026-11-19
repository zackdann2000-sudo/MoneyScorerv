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
 * (histórico ESPN/API-Football), ponderadas pela forma recente: 1.5 nos 3
 * últimos jogos, 1.0 do 4º ao 7º e 0.5 do 8º ao 10º. Quando o confronto direto
 * é travado, o total de gols/cartões é corrigido antes de virar probabilidade —
 * e o card diz que corrigiu. Número ausente na fonte → "sem dados", nunca zero.
 */
import { useMemo } from "react";
import { Flag, Footprints, Goal, Info, SquareStack } from "lucide-react";
import {
  BASE_ULTIMOS,
  blocoAnalises,
  type AnaliseBloco,
  type ContextoH2H,
  type MediasTime,
  type MetricaId,
} from "@/lib/blocoAnalises";

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
          <Icone size={12} className={`shrink-0 ${item.semDados ? "text-mut" : cor}`} />
          <span className="text-[10px] font-extrabold text-ink uppercase tracking-normal leading-tight break-words min-w-0">
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
            {item.xg != null && (
              <span
                className="text-[8px] font-bold text-sky-400 shrink-0"
                title="Modelo ajustado pela qualidade das chances (xG)"
              >
                · xG {num(item.xg, 2)} {item.xgFonte === "api-football" ? "Oficial" : "Est."}
              </span>
            )}
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

          {item.ajuste?.aplicado && (
            <p className="text-[8px] text-mut/90 leading-none truncate">
              H2H {item.ajuste.fator < 1 ? "travado" : "aberto"} ·{" "}
              {Math.abs(Math.round((item.ajuste.fator - 1) * 100))}%{" "}
              {item.ajuste.fator < 1 ? "abaixo" : "acima"} · {item.ajuste.jogos} jogos
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function BlocoAnalises({
  casa,
  fora,
  nomes,
  h2h,
}: {
  casa: MediasTime | null | undefined;
  fora: MediasTime | null | undefined;
  nomes?: [string, string];
  /** H2H já resumido (gols/cartões por confronto, últimos 7). */
  h2h?: ContextoH2H | null;
}) {
  const itens = useMemo(() => blocoAnalises(casa, fora, h2h), [casa, fora, h2h]);
  const comDados = itens.filter((i) => !i.semDados).length;

  return (
    <section className="rounded-2xl border border-line bg-panel/40 p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[11px] font-extrabold text-ink uppercase tracking-wide">
            4 análises do confronto
          </h3>
          <p className="text-[9px] text-mut leading-none mt-0.5">
            baseado nos últimos {BASE_ULTIMOS} jogos
          </p>
        </div>
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
          Médias dos últimos {BASE_ULTIMOS} jogos, com peso maior nos 3 mais recentes (1.5 / 1.0 / 0.5).
          <strong className="text-ink/80"> Over</strong> é a probabilidade de passar a linha logo abaixo do
          total esperado (Poisson), já corrigida pelo H2H quando há 3+ confrontos. Não é odd nem promessa
          de acerto.
        </span>
      </p>
    </section>
  );
}
