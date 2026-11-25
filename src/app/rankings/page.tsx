import Link from "next/link";
import { Crest, SourceFoot, EmptyState } from "@/components/ui";
import { LIGAS_RANKING, dadosRankingsComIdade } from "@/lib/rankingsData";
import { leagueInfo } from "@/lib/espn";
import { idadeDoDado } from "@/lib/idadeDado";
import SeloFrescor from "@/components/SeloFrescor";
import {
  MERCADOS,
  mercadoPorId,
  ranquear,
  maiorAmostra,
  type EntradaTime,
  type Periodo,
} from "@/lib/rankingsEngine";

const PERIODOS: { id: Periodo; rotulo: string }[] = [
  { id: 5, rotulo: "Últimos 5" },
  { id: 10, rotulo: "Últimos 10" },
  { id: 0, rotulo: "Temporada" },
];

const MINIMOS = [
  { id: 0, rotulo: "Todos" },
  { id: 5, rotulo: "5+" },
  { id: 7, rotulo: "7+" },
  { id: 10, rotulo: "10+" },
];

type Params = { liga?: string; mercado?: string; periodo?: string; min?: string };

/** Monta o href preservando os outros filtros. */
function href(params: Params, patch: Partial<Params>): string {
  const next = { ...params, ...patch };
  const q = new URLSearchParams();
  if (next.liga) q.set("liga", next.liga);
  if (next.mercado) q.set("mercado", next.mercado);
  if (next.periodo) q.set("periodo", next.periodo);
  if (next.min) q.set("min", next.min);
  const s = q.toString();
  return s ? `/rankings?${s}` : "/rankings";
}

export const metadata = {
  title: "Rankings por métrica — melhores equipes em Over 2.5, BTTS, escanteios e cartões",
  description:
    "Ranking de equipes por taxa de acerto em mercados: Over 1.5, Over 2.5, Ambas marcam, clean sheet, Over 9.5 escanteios e Over 3.5 cartões.",
};

export default async function RankingsPage({ searchParams }: { searchParams?: Promise<Params> }) {
  const sp = (await searchParams) ?? {};

  const ligaAtiva = (LIGAS_RANKING as readonly string[]).includes(sp.liga ?? "") ? (sp.liga as string) : LIGAS_RANKING[0];
  const mercado = mercadoPorId(sp.mercado);
  const periodo: Periodo = sp.periodo === "5" ? 5 : sp.periodo === "0" ? 0 : 10;
  const minJogos = [0, 5, 7, 10].includes(Number(sp.min)) ? Number(sp.min) : 0;

  const params: Params = {
    liga: ligaAtiva,
    mercado: mercado.id,
    periodo: String(periodo),
    min: String(minJogos),
  };

  const base: { times: EntradaTime[]; atualizadoEm: Date | null } = await dadosRankingsComIdade([ligaAtiva]).catch(
    () => ({ times: [], atualizadoEm: null }),
  );
  const { times, atualizadoEm } = base;
  const ranking = ranquear(times, mercado.id, { periodo, minJogos, limite: 25 });
  const amostra = maiorAmostra(times, periodo);
  const liga = leagueInfo(ligaAtiva);

  /* Selo "Atualizado há X": a idade vem do campo atualizado_em do Neon.
     `idadeDoDado` já trata relógio adiantado como "agora" (nunca idade
     negativa) — e mantém o `Date.now()` fora do corpo do render, que é o que
     a regra `react-hooks/purity` do React Compiler proíbe. */
  const idadeMs = idadeDoDado(atualizadoEm ? atualizadoEm.getTime() : null)?.ms ?? null;

  return (
    <main className="mx-auto max-w-screen-md px-3 py-4 space-y-3">
      <header className="rounded-2xl border border-line bg-gradient-to-br from-acc/10 via-panel to-panel p-4">
        <p className="text-[10px] font-extrabold uppercase tracking-wide text-acc">Rankings por métrica</p>
        <h1 className="font-display text-2xl font-extrabold text-ink leading-tight mt-1">
          Quem é o melhor em cada mercado
        </h1>
        <p className="text-[11px] text-mut mt-1">
          Taxa de acerto real por equipe — {mercado.descricao}.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[9px] text-acc/90">
            Acerto = jogo finalizado que bateu o mercado · dados ESPN · escanteios e cartões são o total do jogo
          </span>
          <SeloFrescor
            idadeMs={idadeMs}
            titulo={
              atualizadoEm
                ? `Cache gravado pelo cron diário em ${atualizadoEm.toLocaleString("pt-BR")}`
                : "Cache ainda não gravado pelo cron"
            }
          />
        </div>
      </header>

      {/* Mercado */}
      <div className="overflow-x-auto no-scrollbar">
        <div className="flex gap-2">
          {MERCADOS.map((m) => {
            const on = m.id === mercado.id;
            return (
              <Link
                key={m.id}
                href={href(params, { mercado: m.id })}
                aria-current={on ? "page" : undefined}
                className={`shrink-0 h-8 px-3 rounded-full border text-[11px] font-bold inline-flex items-center ${
                  on ? "border-acc bg-acc/15 text-acc" : "border-line bg-panel text-mut"
                }`}
              >
                {m.rotulo}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Liga · período · mínimo */}
      <div className="rounded-xl border border-line bg-panel p-2.5 space-y-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[9px] font-bold uppercase tracking-wide text-mut shrink-0 w-11">Liga</span>
          <div className="overflow-x-auto no-scrollbar">
            <div className="flex gap-1.5">
              {LIGAS_RANKING.map((code) => {
                const on = code === ligaAtiva;
                return (
                  <Link
                    key={code}
                    href={href(params, { liga: code })}
                    className={`shrink-0 h-7 px-2.5 rounded-lg border text-[10px] font-bold inline-flex items-center ${
                      on ? "border-acc text-acc bg-acc/10" : "border-line text-mut"
                    }`}
                  >
                    {leagueInfo(code).name}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[9px] font-bold uppercase tracking-wide text-mut shrink-0 w-11">Período</span>
          <div className="flex gap-1.5">
            {PERIODOS.map((p) => {
              const on = p.id === periodo;
              return (
                <Link
                  key={p.id}
                  href={href(params, { periodo: String(p.id) })}
                  className={`h-7 px-2.5 rounded-lg border text-[10px] font-bold inline-flex items-center ${
                    on ? "border-acc text-acc bg-acc/10" : "border-line text-mut"
                  }`}
                >
                  {p.rotulo}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[9px] font-bold uppercase tracking-wide text-mut shrink-0 w-11">Mín.</span>
          <div className="flex gap-1.5">
            {MINIMOS.map((m) => {
              const on = m.id === minJogos;
              return (
                <Link
                  key={m.id}
                  href={href(params, { min: String(m.id) })}
                  className={`h-7 px-2.5 rounded-lg border text-[10px] font-bold inline-flex items-center ${
                    on ? "border-acc text-acc bg-acc/10" : "border-line text-mut"
                  }`}
                >
                  {m.rotulo}
                </Link>
              );
            })}
          </div>
          <span className="ml-auto text-[9px] text-mut shrink-0">
            {ranking.length} equipe{ranking.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {!mercado.precisaEstat && ranking.length > 0 && (
        <p className="text-[9px] text-mut px-1">
          Escanteios e cartões usam os últimos {amostra || 10} jogos observados; mercados de gols usam o período inteiro.
        </p>
      )}

      {ranking.length === 0 ? (
        <EmptyState
          title="Sem equipes com essa amostra"
          sub={`Nenhuma equipe de ${liga.name} tem ${minJogos || 1}+ jogos observados em ${mercado.rotulo}. Baixe o mínimo ou troque o período.`}
        />
      ) : (
        <section className="rounded-2xl border border-line bg-panel overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-line">
            <h2 className="font-display text-[12px] font-extrabold uppercase tracking-wide text-ink truncate">
              {mercado.rotulo} · {liga.name}
            </h2>
            <span className="shrink-0 text-[9px] font-bold text-mut tabular-nums">
              {periodo === 0 ? "temporada" : `últimos ${periodo}`}
            </span>
          </div>
          <div className="divide-y divide-line">
            {ranking.map((t, i) => {
              const pct = Math.round(t.taxa * 1000) / 10;
              /* Barra: 100% = largura cheia. Cor muda só no topo do ranking para
                 o olho achar os líderes sem precisar ler número. */
              const destaque = i < 3;
              return (
                <div key={t.id} className="flex items-center gap-2.5 px-3 py-2.5">
                  <span
                    className={`w-5 text-center text-[11px] font-extrabold tabular-nums shrink-0 ${
                      destaque ? "text-acc" : "text-mut"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <Crest src={t.escudo} size={22} alt={t.nome} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5 min-w-0">
                      <Link
                        href={`/times/${t.id}?league=${t.ligaCodigo}`}
                        className="truncate text-[12px] font-bold text-ink hover:text-acc"
                      >
                        {t.nome}
                      </Link>
                      <span className="shrink-0 text-[9px] text-mut">{t.liga}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-panel2 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${destaque ? "bg-acc" : "bg-acc/50"}`}
                        style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
                      />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-[13px] font-extrabold tabular-nums ${destaque ? "text-acc" : "text-ink"}`}>
                      {pct.toFixed(1)}%
                    </p>
                    <p className="text-[9px] text-mut tabular-nums">
                      {t.acertos}/{t.jogos}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-3 py-2 border-t border-line">
            <SourceFoot
              fonte="ESPN"
              amostra={amostra}
              extra={`${mercado.rotulo} · mínimo ${minJogos || 1} jogo(s)`}
            />
          </div>
        </section>
      )}

      <p className="text-[9px] leading-snug text-mut px-1">
        Acerto passado não é garantia de resultado futuro. Ranking é descritivo: mostra frequência observada, não
        probabilidade do próximo jogo — para isso use o Veredito e o Edge.
      </p>
    </main>
  );
}
