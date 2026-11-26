"use client";

import { Flame, TrendingUp } from "lucide-react";
import type { QuentesLado } from "@/lib/tendencias";
import { useTendencias } from "./useTendencias";

/**
 * Painel "Quentes" — forma recente e sequências do confronto.
 *
 * É leitura de contexto, não previsão: mostra V/E/D e o que vem acontecendo
 * ("não perde há 5", "marcou nos últimos 7"). Nada aqui é probabilidade.
 *
 * Dois modos:
 *   <QuentesBlock casa={...} fora={...} />  → puro, recebe os dados
 *   <QuentesAuto matchId league />          → busca sozinho (usado em ESTATÍSTICAS)
 */

const COR: Record<"V" | "E" | "D", string> = {
  V: "bg-acc/20 text-acc border-acc/40",
  E: "bg-panel2 text-mut border-line",
  D: "bg-danger/15 text-danger border-danger/40",
};

function Faixa({ faixa }: { faixa: ("V" | "E" | "D")[] }) {
  if (!faixa.length) return <span className="text-[10px] text-mut">sem jogos</span>;
  return (
    <div className="flex items-center gap-1" aria-label={`Forma: ${faixa.join(" ")}`}>
      {faixa.map((r, i) => (
        <span
          key={i}
          title={`${i + 1}º mais antigo: ${r === "V" ? "vitória" : r === "E" ? "empate" : "derrota"}`}
          className={`inline-flex h-5 w-5 items-center justify-center rounded-md border text-[9px] font-black ${COR[r]}`}
        >
          {r}
        </span>
      ))}
    </div>
  );
}

function Sequencias({ items }: { items: QuentesLado["sequencias"] }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-0.5">
      {items.map((s) => (
        <li
          key={s.id}
          className={`flex items-center gap-1.5 text-[10.5px] ${s.destaque ? "text-ink font-bold" : "text-mut"}`}
        >
          <Flame size={10} className={s.destaque ? "text-warn" : "text-mut"} />
          <span>
            {s.texto} <b className="tabular-nums">{s.n}</b>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Lado({
  nome,
  q,
  destaque,
}: {
  nome: string;
  q: QuentesLado;
  destaque: "home" | "away";
}) {
  return (
    <div className="rounded-xl border border-line bg-panel2 p-2.5 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className={`truncate text-[11px] font-extrabold ${destaque === "home" ? "text-home" : "text-away"}`}>
          {nome}
        </span>
        {q.aproveitamento != null && (
          <span className="shrink-0 text-[9.5px] font-bold text-mut tabular-nums">
            {q.aproveitamento}% V
          </span>
        )}
      </div>
      <Faixa faixa={q.faixa} />
      <Sequencias items={q.sequencias} />
      {!q.sequencias.length && q.amostra > 0 && q.amostra < 3 && (
        <p className="text-[9.5px] text-mut/70">Amostra curta ({q.amostra} jogo{q.amostra === 1 ? "" : "s"}).</p>
      )}
    </div>
  );
}

export function QuentesBlock({
  casa,
  fora,
  homeNome,
  awayNome,
}: {
  casa: QuentesLado;
  fora: QuentesLado;
  homeNome: string;
  awayNome: string;
}) {
  return (
    <section className="rounded-2xl border border-line bg-panel p-3 space-y-2">
      <header className="flex items-center gap-1.5">
        <TrendingUp size={12} className="text-acc" />
        <h3 className="text-[10px] font-black uppercase tracking-wide text-mut">Quentes · forma recente</h3>
      </header>
      <div className="grid gap-2 sm:grid-cols-2">
        <Lado nome={homeNome} q={casa} destaque="home" />
        <Lado nome={awayNome} q={fora} destaque="away" />
      </div>
      <p className="text-[9px] text-mut/70 leading-relaxed">
        Sequências só aparecem com 3 jogos ou mais. Sem dado da fonte, o bloco fica vazio —
        não preenchemos com zero.
      </p>
    </section>
  );
}

/**
 * Versão autossuficiente para encaixar dentro de ESTATÍSTICAS.
 *
 * Reaproveita o mesmo endpoint e o mesmo memo do hook: se a aba TENDÊNCIAS já
 * carregou, aqui não há nenhuma nova ida à rede.
 */
export function QuentesAuto({
  matchId,
  league,
  homeNome,
  awayNome,
}: {
  matchId: string;
  league: string;
  homeNome: string;
  awayNome: string;
}) {
  const { data, loading, error } = useTendencias(matchId, league, { amostra: 10 });

  if (loading) {
    return (
      <div className="rounded-2xl border border-line bg-panel p-3">
        <div className="h-14 animate-pulse rounded-xl bg-panel2" />
      </div>
    );
  }
  /* Sem dado ou erro: o bloco simplesmente não aparece. É contexto, não pode
     empurrar a estatística principal para baixo nem virar caixa de erro. */
  if (error || !data?.quentes) return null;

  return (
    <QuentesBlock
      casa={data.quentes.casa}
      fora={data.quentes.fora}
      homeNome={homeNome}
      awayNome={awayNome}
    />
  );
}

export default QuentesBlock;
