"use client";

import { useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { useApi } from "./useApi";
import type { JogosResp, JogoLista } from "./types";
import { ErrorBox, EmptyBox, Spinner, FonteBadge, horaJogo, diaCurto } from "./Ui";
import { isMainLeague } from "@/lib/mainLeagues";
import LeagueFilterPill, { usePrincipaisLigas } from "@/components/LeagueFilter";

/**
 * Aba "Jogos do Dia" — lista por dia com o resumo de cada partida.
 *
 * Consome GET /api/apitou/jogos?date=YYYY-MM-DD. A rota devolve também a lista
 * de dias disponíveis; usamos isso para navegar entre datas sem chamada extra.
 */
export default function JogosTab({
  date,
  onAbrirJogo,
}: {
  date: string;
  onAbrirJogo: (id: number) => void;
}) {
  // Buscamos TODOS os jogos de uma vez (sem ?date=). Assim a troca de dia é
  // instantânea, no cliente, e um dia vazio não "prende" a tela: a rota devolve
  // `dias` completo e `jogos` de toda a semana (payload pequeno, ~14 jogos).
  // Passar ?date= fazia a rota devolver só aquele dia, anulando o filtro local.
  const url = "/api/apitou/jogos";
  const { data, loading, error, refresh } = useApi<JogosResp>(url, []);
  const [diaSel, setDiaSel] = useState<string | null>(null);
  const [soPrincipais, setSoPrincipais] = usePrincipaisLigas();

  // Dias disponíveis vêm da rota (TODOS os dias cobertos, já ordenados).
  const dias = useMemo(() => data?.dias ?? [], [data]);

  /**
   * Dia efetivamente exibido.
   *
   * O bug antigo: fixávamos a data de hoje (`date`), mas quando os jogos de hoje
   * já saíram do banco a lista ficava vazia e o botão do dia nem aparecia. Agora
   * o dia é derivado com validação, nesta ordem de prioridade:
   *   1. o dia escolhido pelo usuário, se ele ainda existir na lista;
   *   2. a data de hoje, se ela tiver jogos;
   *   3. o PRIMEIRO dia disponível (o mais próximo).
   * Derivar em vez de `setState` num efeito evita render extra e a regra
   * react-hooks/set-state-in-effect.
   */
  const diaAtivo = useMemo(() => {
    if (diaSel && dias.includes(diaSel)) return diaSel;
    if (dias.includes(date)) return date;
    return dias[0] ?? date;
  }, [diaSel, dias, date]);

  const jogosDoDia = useMemo(() => {
    if (!data) return [] as JogoLista[];
    const doDia = data.jogos.filter((j) => j.dia === diaAtivo);
    // Filtro no cliente (a lista completa da semana já vem no payload) — a
    // escolha de dia continua baseada em TODOS os jogos, sem quebrar nada.
    return soPrincipais ? doDia.filter((j) => isMainLeague(j.competicao)) : doDia;
  }, [data, diaAtivo, soPrincipais]);

  if (loading && !data) return <Spinner label="Carregando jogos…" />;
  if (error) return <ErrorBox message={error} onRetry={() => refresh()} />;
  if (!data) return null;

  const totalDia = jogosDoDia.length;

  return (
    <div className="space-y-3">
      {/* Alternância Principais / Todas (padrão: Principais). */}
      <LeagueFilterPill principais={soPrincipais} onChange={setSoPrincipais} />

      {/* Seletor de dia horizontal */}
      {dias.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {dias.map((d) => (
            <button
              key={d}
              // Sem toggle para null: clicar no dia ativo não deve poder voltar
              // para uma data sem jogos.
              onClick={() => setDiaSel(d)}
              aria-pressed={diaAtivo === d}
              className={`shrink-0 px-3 h-8 rounded-xl border text-[11px] font-bold transition-colors ${
                diaAtivo === d ? "bg-acc text-bg border-acc" : "bg-panel border-line text-ink"
              }`}
            >
              {diaCurto(d)}
            </button>
          ))}
        </div>
      )}

      <p className="text-xs text-mut">
        <span className="text-acc font-extrabold">{totalDia}</span> {totalDia === 1 ? "jogo" : "jogos"}
        {diaAtivo ? ` · ${diaCurto(diaAtivo)}` : ""}
      </p>

      {totalDia === 0 ? (
        <EmptyBox>
          {soPrincipais ? "Nenhum jogo das principais ligas neste dia. Use \"Todas as Ligas\" para ver o dia completo." : "Nenhum jogo neste dia. O site só cobre a semana corrente."}
        </EmptyBox>
      ) : (
        <ul className="space-y-2">
          {jogosDoDia.map((j) => (
            <li key={j.id}>
              <button
                onClick={() => onAbrirJogo(j.id)}
                className="w-full text-left rounded-2xl border border-line bg-panel hover:border-acc/60 transition-colors p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold text-mut uppercase tracking-wide truncate">
                    {j.competicao}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-acc tabular-nums">
                    <CalendarDays size={11} /> {horaJogo(j.kickoff)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex-1 truncate font-bold text-ink">{j.home}</span>
                  <span className="text-[10px] text-mut shrink-0">×</span>
                  <span className="flex-1 truncate font-bold text-ink text-right">{j.away}</span>
                </div>

                {/* Metadados compactos: quantas props e mercados */}
                <div className="flex items-center justify-between gap-2 text-[10px] text-mut">
                  <span className="inline-flex gap-2">
                    {j.jogadores > 0 && <span>{j.jogadores} props</span>}
                    {j.mercados > 0 && <span>{j.mercados} mercados</span>}
                  </span>
                  <span className="truncate max-w-[55%] text-right">{j.arbitro ?? ""}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <FonteBadge geradoEm={data.geradoEm} stale={data.stale} />
    </div>
  );
}