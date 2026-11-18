"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Grid3x3, Sparkles } from "lucide-react";
import LeagueFilterPill from "@/components/LeagueFilter";
import { isMainLeague } from "@/lib/mainLeagues";
import { useApi } from "./useApi";
import type { Board, Jogo } from "./types";
import { CacheBadge, ConfBar, EmptyBox, ErrorBox, Odd, PickChip, ResultadoPill, Spinner } from "./Ui";

/**
 * Aba "Palpites": o board do dia do NerdyTips.
 *
 * Cada linha é um jogo com as odds de 1X2, o palpite de melhor confiança e os
 * palpites de gols/BTTS. Toque abre a análise completa do jogo.
 *
 * O filtro de ligas começa DESLIGADO aqui: o site cobre 700+ competições e o
 * board do dia quase nunca tem uma das 16 principais — ligar por padrão daria
 * tela vazia.
 */
export default function PalpitesTab({ onAbrirJogo }: { onAbrirJogo: (id: string) => void }) {
  const [modo, setModo] = useState<"hoje" | "todas" | "placar">("hoje");
  const [soPrincipais, setSoPrincipais] = useState(false);

  const query = modo === "todas" ? "?todas=1" : modo === "placar" ? "?placar=1" : "";
  const { data, loading, error, refresh } = useApi<Board>(`/api/nerdytips/palpites${query}`);

  const grupos = useMemo(() => {
    const jogos = (data?.jogos ?? []).filter((j) => !soPrincipais || isMainLeague(j.liga));
    const mapa = new Map<string, Jogo[]>();
    for (const j of jogos) {
      const chave = j.liga || "Outras competições";
      const arr = mapa.get(chave) ?? [];
      arr.push(j);
      mapa.set(chave, arr);
    }
    return Array.from(mapa.entries());
  }, [data, soPrincipais]);

  const total = grupos.reduce((n, [, j]) => n + j.length, 0);

  return (
    <div className="space-y-3">
      {/* Hoje / Todas / Placar exato */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex rounded-full border border-line bg-panel p-0.5">
          {(
            [
              ["hoje", "Hoje"],
              ["todas", "Todas"],
              ["placar", "Placar exato"],
            ] as const
          ).map(([valor, label]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setModo(valor)}
              aria-pressed={modo === valor}
              className={`h-7 px-3 rounded-full text-[11px] font-bold ${modo === valor ? "bg-acc text-bg" : "text-mut"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <LeagueFilterPill principais={soPrincipais} onChange={setSoPrincipais} />
      </div>

      {loading && !data && <Spinner label="Buscando palpites…" />}
      {error && <ErrorBox message={error} onRetry={() => refresh()} />}

      {data && (
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-mut">
            {total} jogos · {grupos.length} competições
          </p>
          <CacheBadge cache={data.cache} />
        </div>
      )}

      {data && total === 0 && !loading && (
        <EmptyBox>
          Nenhum jogo para mostrar com esses filtros. Desligue “Principais Ligas” ou toque em
          “Todas”.
        </EmptyBox>
      )}

      {grupos.map(([liga, jogos]) => (
        <section key={liga} className="space-y-1.5">
          <h3 className="text-[10px] font-extrabold text-mut uppercase tracking-wide px-1">{liga}</h3>
          <div className="space-y-1.5">
            {jogos.map((j) => (
              <button
                key={j.id}
                type="button"
                onClick={() => onAbrirJogo(j.id)}
                className="w-full text-left rounded-2xl border border-line bg-panel p-2.5 active:bg-panel/70"
              >
                <div className="flex items-start gap-2">
                  {/* Horário / estado */}
                  <div className="w-9 shrink-0 pt-0.5 text-center">
                    <span className="text-[10px] font-extrabold text-ink tabular-nums">{j.hora}</span>
                  </div>

                  {/* Times e placar */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="flex-1 min-w-0 truncate text-[12px] font-bold text-ink">{j.casa}</span>
                      <span className="text-[12px] font-extrabold tabular-nums text-ink">
                        {j.placar ? j.placar.casa : "–"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="flex-1 min-w-0 truncate text-[12px] font-bold text-ink">{j.fora}</span>
                      <span className="text-[12px] font-extrabold tabular-nums text-ink">
                        {j.placar ? j.placar.fora : "–"}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-1 pt-2">
                    <ResultadoPill status={j.status} />
                    <ChevronRight size={14} className="text-mut" />
                  </div>
                </div>

                {/* Odds 1X2 */}
                <div className="mt-1.5 flex items-center gap-2 text-[10px] text-mut">
                  <span className="font-bold">1</span>
                  <Odd valor={j.odds.casa} />
                  <span className="font-bold">X</span>
                  <Odd valor={j.odds.empate} />
                  <span className="font-bold">2</span>
                  <Odd valor={j.odds.fora} />
                </div>

                {/* Melhor palpite + confiança (ou placar exato) */}
                {modo === "placar" ? (
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-acc">
                      <Grid3x3 size={10} /> Placar exato
                    </span>
                    <span className="text-[13px] font-extrabold tabular-nums text-ink">
                      {j.placarExato ?? j.melhor?.rotulo ?? "—"}
                    </span>
                    {j.melhor?.confianca != null && <ConfBar valor={j.melhor.confianca} />}
                  </div>
                ) : (
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                    {j.melhor ? (
                      <>
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-acc">
                          <Sparkles size={10} />
                          {j.melhor.texto}
                          {j.melhor.odd != null && (
                            <b className="tabular-nums">{j.melhor.odd.toFixed(2)}</b>
                          )}
                        </span>
                        <ConfBar valor={j.melhor.confianca} />
                      </>
                    ) : (
                      <span className="text-[10px] text-mut">Sem palpite publicado</span>
                    )}
                  </div>
                )}

                {modo !== "placar" && (j.pickGols || j.pickBtts) && (
                  <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                    <PickChip pick={j.pickGols} />
                    <PickChip pick={j.pickBtts} />
                  </div>
                )}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
