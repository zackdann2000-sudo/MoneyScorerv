"use client";

import { useMemo } from "react";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { useApi } from "./useApi";
import type { JogosResp, JogoLista } from "./types";
import { ErrorBox, EmptyBox, Spinner, FonteBadge, horaJogo, diaCurto } from "./Ui";
import { isMainLeague } from "@/lib/mainLeagues";
import LeagueFilterPill, { usePrincipaisLigas } from "@/components/LeagueFilter";
import DateStrip7 from "@/components/DateStrip7";

/**
 * Aba "Jogos do Dia" — lista por dia com o resumo de cada partida.
 *
 * Consome GET /api/apitou/jogos?date=YYYY-MM-DD. A rota devolve também a lista
 * de dias disponíveis; usamos isso para navegar entre datas sem chamada extra.
 */
export default function JogosTab({
  date,
  onAbrirJogo,
  onMudarDia,
  liga,
  onAbrirLiga,
  onVoltarLigas,
}: {
  date: string;
  onAbrirJogo: (id: number) => void;
  /** Grava o dia na URL (?data=) — o dia não pode viver só em useState. */
  onMudarDia?: (ymd: string) => void;
  /** Liga aberta (?liga=) — a lista mostra só ela naquele dia. */
  liga?: string | null;
  onAbrirLiga?: (nome: string) => void;
  onVoltarLigas?: () => void;
}) {
  // Buscamos TODOS os jogos de uma vez (sem ?date=). Assim a troca de dia é
  // instantânea, no cliente, e um dia vazio não "prende" a tela: a rota devolve
  // `dias` completo e `jogos` de toda a semana (payload pequeno, ~14 jogos).
  // Passar ?date= fazia a rota devolver só aquele dia, anulando o filtro local.
  const url = "/api/apitou/jogos";
  const { data, loading, error, refresh } = useApi<JogosResp>(url, []);
  const [soPrincipais, setSoPrincipais] = usePrincipaisLigas();

  // Dias disponíveis vêm da rota (TODOS os dias cobertos, já ordenados).
  const dias = useMemo(() => data?.dias ?? [], [data]);

  /**
   * Dia efetivamente exibido — derivado da URL (`date`), nunca de um estado
   * paralelo. Se a data da URL não tiver jogos, cai no primeiro dia disponível,
   * mas assim que o usuário escolhe um dia ele vai para a URL.
   */
  const diaAtivo = useMemo(() => {
    if (dias.includes(date)) return date;
    return dias[0] ?? date;
  }, [dias, date]);

  const jogosDoDia = useMemo(() => {
    if (!data) return [] as JogoLista[];
    const doDia = data.jogos.filter((j) => j.dia === diaAtivo);
    // Filtro no cliente (a lista completa da semana já vem no payload) — a
    // escolha de dia continua baseada em TODOS os jogos, sem quebrar nada.
    return soPrincipais ? doDia.filter((j) => isMainLeague(j.competicao)) : doDia;
  }, [data, diaAtivo, soPrincipais]);

  /** Com liga aberta, só os jogos dela — no dia selecionado. */
  const visiveis = useMemo(
    () => (liga ? jogosDoDia.filter((j) => j.competicao === liga) : jogosDoDia),
    [jogosDoDia, liga],
  );

  if (loading && !data) return <Spinner label="Carregando jogos…" />;
  if (error) return <ErrorBox message={error} onRetry={() => refresh()} />;
  /* Sem dado, sem erro e sem loading: mostra o skeleton, nunca tela branca. */
  if (!data) return <Spinner label="Carregando jogos…" />;

  const totalDia = visiveis.length;

  return (
    <div className="space-y-3">
      {/* Alternância Principais / Todas (padrão: Principais). */}
      <LeagueFilterPill principais={soPrincipais} onChange={setSoPrincipais} />

      {/* Barra de 7 dias (Segunda → Domingo). A data vai para a URL. */}
      <DateStrip7 value={diaAtivo} onChange={(ymd) => onMudarDia?.(ymd)} />

      {/* Liga aberta: volta para a lista de ligas MANTENDO o dia. */}
      {liga && (
        <div className="flex items-center gap-2 rounded-xl border border-acc/40 bg-acc/10 px-2 py-1.5">
          <button
            onClick={onVoltarLigas}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-acc/60 bg-panel px-2.5 text-[11px] font-extrabold text-acc"
          >
            <ArrowLeft size={13} /> Voltar às ligas
          </button>
          <span className="min-w-0 flex-1 truncate text-[12px] font-extrabold text-ink">{liga}</span>
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
          {visiveis.map((j) => (
            <li key={j.id}>
              <button
                onClick={() => onAbrirJogo(j.id)}
                className="w-full text-left rounded-2xl border border-line bg-panel hover:border-acc/60 transition-colors p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    role="link"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAbrirLiga?.(j.competicao);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        onAbrirLiga?.(j.competicao);
                      }
                    }}
                    title="Ver só os jogos desta liga"
                    className="text-[10px] font-bold text-mut uppercase tracking-wide truncate hover:text-acc"
                  >
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

      <FonteBadge geradoEm={data.geradoEm} atualizadoEm={data.atualizadoEm} revalidando={data.revalidando} />
    </div>
  );
}