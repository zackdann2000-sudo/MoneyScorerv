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
import { useMemo, useState } from "react";
import { Eye, EyeOff, Flag, Footprints, Goal, Info, SquareStack } from "lucide-react";
import {
  BASE_ULTIMOS,
  blocoAnalises,
  type AnaliseBloco,
  type ContextoH2H,
  type MediasTime,
  type MetricaId,
} from "@/lib/blocoAnalises";
import { LIMIAR_PROB } from "@/lib/oportunidadeFiltros";

/** Piso de exibição em pontos percentuais (mesma régua do resto do app). */
const PISO_PCT = LIMIAR_PROB * 100;

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

function Card({ item, ocultarProb }: { item: AnaliseBloco; ocultarProb: boolean }) {
  const Icone = ICONES[item.id];
  const cor = CORES[item.id];
  /* Abaixo do piso: some o número e a barra. A média e o total esperado ficam,
     porque são dados descritivos, não probabilidade de aposta. */
  const escondido = ocultarProb && item.prob != null && item.prob < PISO_PCT;

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
          ) : escondido ? (
            /* Abaixo de 75%: some o número E a barra. Ficam só os dados brutos
               (total esperado, médias e xG) — nada de probabilidade esmaecida. */
            <p
              className="text-[9px] font-bold text-mut/80 leading-none"
              title='Probabilidade abaixo do limite do app (75%) — use "Mostrar < 75%" para ver'
            >
              abaixo de {PISO_PCT}%
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-bold text-ink tabular-nums">Over {num(item.linha)}</span>
                <span className={`text-[10px] font-extrabold tabular-nums ${cor}`}>
                  {item.prob == null ? "—" : `${Math.round(item.prob)}%`}
                </span>
              </div>
              <div className="min-w-0">
                <div className="h-1 rounded-full bg-line overflow-hidden">
                  <div className={`h-full ${cor.replace("text-", "bg-")}`} style={{ width: `${item.prob ?? 0}%` }} />
                </div>
              </div>
            </>
          )}

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
  /* Cada linha do bloco SEMPRE mostra a probabilidade (Poisson) calculada
     sobre os últimos 10 jogos dos dois times. O piso de 75% deixou de ser o
     padrão: o usuário pode OCULTAR as linhas abaixo dele, mas o número vem
     visível por padrão — é o dado pedido na tela.
     1.5, 1.0 e 0.5 nos últimos 10 — e a linha é a mais alta que ainda fica
     com ~80% no total. */
  const [mostrarAbaixo, setMostrarAbaixo] = useState(true);
  const ocultos = itens.filter((i) => i.prob != null && i.prob < PISO_PCT).length;

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

      {ocultos > 0 && (
        <button
          type="button"
          onClick={() => setMostrarAbaixo((v) => !v)}
          aria-pressed={mostrarAbaixo}
          title="Mostra as probabilidades abaixo de 75% (cartões, faltas, gols, impedimentos)"
          className={`inline-flex items-center gap-1 h-6 rounded-full border px-2 text-[9px] font-extrabold ${
            mostrarAbaixo ? "border-acc text-acc bg-acc/10" : "border-line text-mut bg-panel2"
          }`}
        >
          {mostrarAbaixo ? <Eye size={10} /> : <EyeOff size={10} />}
          {mostrarAbaixo ? "Ocultar < 75%" : `Mostrar < 75% (${ocultos})`}
        </button>
      )}

      <div className="grid grid-cols-2 gap-1.5">
        {itens.map((item) => (
          <Card key={item.id} item={item} ocultarProb={!mostrarAbaixo} />
        ))}
      </div>

      <p className="text-[9px] text-mut leading-relaxed flex items-start gap-1">
        <Info size={9} className="mt-0.5 shrink-0" />
        <span>
          Médias dos últimos {BASE_ULTIMOS} jogos, com peso maior nos 3 mais recentes (1.5 / 1.0 / 0.5).
          <strong className="text-ink/80"> Over</strong> é a probabilidade de passar a linha mostrada — e a
          linha é a mais alta que ainda fica com ~80% de chance (Poisson), já corrigida pelo H2H quando há 3+
          confrontos. Probabilidade abaixo de 75% fica oculta por padrão. Não é odd nem promessa de acerto.
        </span>
      </p>
    </section>
  );
}
