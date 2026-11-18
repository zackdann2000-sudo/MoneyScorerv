"use client";

import { ArrowLeft, CalendarDays } from "lucide-react";
import { useApi } from "./useApi";
import type { JogoDetalheResp } from "./types";
import { Spinner, ErrorBox, ProbBar, FormBadges, horaJogo, diaCurto } from "./Ui";
import { mainLeagueLabel } from "@/lib/mainLeagues";

/** Linha comparativa entre mandante e visitante. */
function Comparativo({
  rotulo,
  casa,
  fora,
  sufixo = "%",
}: {
  rotulo: string;
  casa: number;
  fora: number;
  sufixo?: string;
}) {
  const melhorCasa = casa >= fora;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-1 border-b border-line/50 last:border-0">
      <span className={`text-[11px] font-bold tabular-nums text-right ${melhorCasa ? "text-acc" : "text-ink"}`}>
        {casa}
        {sufixo}
      </span>
      <span className="text-[9px] text-mut text-center w-24 truncate">{rotulo}</span>
      <span className={`text-[11px] font-bold tabular-nums ${!melhorCasa ? "text-acc" : "text-ink"}`}>
        {fora}
        {sufixo}
      </span>
    </div>
  );
}

export default function JogoDetalhe({
  jogoId,
  date,
  onVoltar,
}: {
  jogoId: string;
  date: string;
  onVoltar: () => void;
}) {
  const { data, loading, error, refresh } = useApi<JogoDetalheResp>(
    `/api/kingstats/jogo/${jogoId}${date ? `?date=${date}` : ""}`,
    [jogoId, date],
  );

  if (loading && !data) return <Spinner label="Carregando análise…" />;
  if (error) return <ErrorBox message={error} onRetry={() => refresh()} />;
  if (!data) return null;

  const { jogo, resumos, modelo, semHistorico } = data;

  return (
    <div className="space-y-3">
      <button
        onClick={onVoltar}
        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-mut hover:text-acc transition-colors"
      >
        <ArrowLeft size={13} /> Voltar aos jogos
      </button>

      <header className="rounded-2xl border border-line bg-panel p-3 space-y-1">
        <p className="text-[9px] font-bold text-mut uppercase tracking-wide truncate">{mainLeagueLabel(jogo.liga)}</p>
        <h2 className="text-sm font-extrabold text-ink leading-tight">
          {jogo.home} <span className="text-mut">×</span> {jogo.away}
        </h2>
        <p className="inline-flex items-center gap-1 text-[10px] text-acc font-bold tabular-nums">
          <CalendarDays size={11} /> {diaCurto(jogo.kickoff)} · {horaJogo(jogo.kickoff)}
        </p>
      </header>

      {semHistorico ? (
        <div className="rounded-2xl border border-line bg-panel p-6 text-center text-mut text-xs">
          A fonte não tem histórico recente para este jogo.
        </div>
      ) : (
        <>
          {/* Modelo */}
          {modelo && (
            <section className="rounded-2xl border border-line bg-panel p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-ink">Modelo Poisson</p>
                <p className="text-[9px] text-mut tabular-nums">
                  λ total {modelo.lambdaTotal.toFixed(2)} · conf {(modelo.confianca * 100).toFixed(0)}%
                </p>
              </div>
              <p className="text-[9px] text-mut tabular-nums">
                Gols esperados: {jogo.home} {modelo.lambdaCasa.toFixed(2)} × {modelo.lambdaFora.toFixed(2)}{" "}
                {jogo.away}
              </p>
              <div className="space-y-1.5 pt-1">
                <ProbBar label="Over 1.5" valor={modelo.prob.over15 * 100} destaque />
                <ProbBar label="Over 2.5" valor={modelo.prob.over25 * 100} />
                <ProbBar label="Over 3.5" valor={modelo.prob.over35 * 100} />
                <ProbBar label="Ambas marcam" valor={modelo.prob.btts * 100} />
                <ProbBar label="Over 0.5 HT" valor={modelo.prob.over05ht * 100} />
              </div>
            </section>
          )}

          {/* Comparativo por mando */}
          {resumos && (
            <section className="rounded-2xl border border-line bg-panel p-3">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 pb-1.5">
                <span className="text-[10px] font-extrabold text-ink text-right truncate">
                  {jogo.home}
                </span>
                <span className="text-[9px] text-mut text-center w-24">vs</span>
                <span className="text-[10px] font-extrabold text-ink truncate">{jogo.away}</span>
              </div>
              <Comparativo rotulo="Over 1.5" casa={resumos.casa.comoCasa.over15} fora={resumos.fora.comoFora.over15} />
              <Comparativo rotulo="Over 2.5" casa={resumos.casa.comoCasa.over25} fora={resumos.fora.comoFora.over25} />
              <Comparativo rotulo="Over 3.5" casa={resumos.casa.comoCasa.over35} fora={resumos.fora.comoFora.over35} />
              <Comparativo rotulo="Ambas marcam" casa={resumos.casa.comoCasa.btts} fora={resumos.fora.comoFora.btts} />
              <Comparativo rotulo="Gols pró" casa={resumos.casa.comoCasa.avgFor} fora={resumos.fora.comoFora.avgFor} sufixo="" />
              <Comparativo rotulo="Gols contra" casa={resumos.casa.comoCasa.avgAgainst} fora={resumos.fora.comoFora.avgAgainst} sufixo="" />
              <Comparativo rotulo="Pontos/jogo" casa={resumos.casa.geral.ppg} fora={resumos.fora.geral.ppg} sufixo="" />
              <Comparativo rotulo="Sem sofrer gol" casa={resumos.casa.geral.cleanSheets} fora={resumos.fora.geral.cleanSheets} />
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 pt-2">
                <span className="flex justify-end">
                  <FormBadges form={modelo?.formCasa ?? ""} />
                </span>
                <span className="text-[9px] text-mut text-center w-24">forma (5)</span>
                <span className="flex justify-start">
                  <FormBadges form={modelo?.formFora ?? ""} />
                </span>
              </div>
            </section>
          )}

          {/* Últimas partidas */}
          {data.ultimas && (
            <div className="grid grid-cols-1 gap-2">
              {(
                [
                  ["Casa", data.ultimas.casa, jogo.home],
                  ["Fora", data.ultimas.fora, jogo.away],
                ] as const
              ).map(([rotulo, partidas, nome]) => (
                <section key={rotulo} className="rounded-2xl border border-line bg-panel p-3 space-y-1">
                  <p className="text-[10px] font-bold text-ink">
                    {nome} <span className="text-mut font-normal">· últimas {partidas.length}</span>
                  </p>
                  {partidas.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="text-mut tabular-nums shrink-0 w-9">
                        {p.casa ? "c" : "f"}
                      </span>
                      <span className="flex-1 truncate text-ink">{p.adversario}</span>
                      <span className="tabular-nums text-ink shrink-0">
                        {p.gf}-{p.ga}
                      </span>
                      <span
                        className={`w-4 h-4 rounded-[4px] text-[8px] font-extrabold inline-flex items-center justify-center shrink-0 ${
                          p.resultado === "W"
                            ? "bg-acc text-bg"
                            : p.resultado === "D"
                              ? "bg-panel2 text-ink"
                              : "bg-danger/80 text-white"
                        }`}
                      >
                        {p.resultado}
                      </span>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
