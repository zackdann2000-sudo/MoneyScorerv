import Link from "next/link";
import { leagueInfo } from "@/lib/espn";
import {
  analisarOportunidades,
  type AnaliseJogo,
  type ModelProbs,
  type OportunidadeValor,
} from "@/lib/opportunitiesEngine";
import { PorqueValor } from "@/components/ValorEsperado";
import OportunidadesLista from "@/components/OportunidadesLista";

/* Palpites IA (MVP inspirado no core loop do Gol Sinyali — recon em
   replica/recon.md). Uma única passada do motor de valor (Poisson/Dixon-Coles
   + forma recente + H2H × odds de mercado) alimenta os cards e a seção de
   "Oportunidades de valor". Nada de dado inventado. */

export const revalidate = 600; // reavalia a cada 10 min

const pct = (v: number) => `${Math.round(v * 100)}%`;
function horaSP(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

/** Mercado mais provável do modelo, para o chip "Destaque". */
function melhorMercado(p: ModelProbs): { mercado: string; prob: number } {
  const res =
    p.home >= p.draw && p.home >= p.away
      ? { mercado: "Casa", prob: p.home }
      : p.away >= p.draw
        ? { mercado: "Fora", prob: p.away }
        : { mercado: "Empate", prob: p.draw };
  const lista = [
    res,
    { mercado: p.over25 >= p.under25 ? "Over 2.5" : "Under 2.5", prob: Math.max(p.over25, p.under25) },
    { mercado: p.btts >= 1 - p.btts ? "Ambas marcam" : "Não ambas", prob: Math.max(p.btts, 1 - p.btts) },
  ];
  return lista.sort((a, b) => b.prob - a.prob)[0];
}

export default async function PalpitesIaPage() {
  const data = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  let analisados: AnaliseJogo[] = [];
  let oportunidades: OportunidadeValor[] = [];
  let erro = "";
  try {
    const r = await analisarOportunidades({ date: data, maxMatches: 6 });
    analisados = r.analisados;
    oportunidades = r.oportunidades;
  } catch (e: any) {
    erro = e?.message || "Não foi possível carregar os jogos agora.";
  }

  // Melhor oportunidade de valor por jogo (para o "porquê" no card).
  const opPorJogo = new Map<string, OportunidadeValor>();
  for (const o of oportunidades) {
    const cur = opPorJogo.get(o.matchId);
    if (!cur || o.valor > cur.valor) opPorJogo.set(o.matchId, o);
  }

  const confCor: Record<string, string> = {
    alta: "bg-acc/15 text-acc border-acc/40",
    média: "bg-warn/15 text-warn border-warn/40",
    baixa: "bg-danger/15 text-danger border-danger/40",
  };

  // Cupom do dia: os 3 jogos com o palpite mais forte.
  const cupom = [...analisados]
    .map((a) => ({ a, destaque: melhorMercado(a.probs) }))
    .sort((x, y) => y.destaque.prob - x.destaque.prob)
    .slice(0, 3);
  const comAlta = analisados.filter((a) => a.confianca === "alta").length;

  return (
    <main className="mx-auto max-w-screen-md px-3 py-4 space-y-4">
      {/* Hero */}
      <header className="rounded-2xl border border-line bg-gradient-to-br from-purple/15 via-panel to-panel p-4">
        <p className="text-[10px] font-extrabold uppercase tracking-wide text-purple">Palpites por IA · Value Bet</p>
        <h1 className="font-display text-2xl font-extrabold text-ink leading-tight mt-1">
          Palpites de futebol de hoje
        </h1>
        <p className="text-[11px] text-mut mt-1">
          Probabilidades reais (Poisson/Dixon-Coles) cruzadas com as odds de mercado para achar valor.
        </p>
        <p className="text-[9px] text-acc/90 mt-2 flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-acc" />
          Modelo ajustado com peso para a forma recente (últimos 10 jogos) + H2H
        </p>
        <p className="text-[9px] text-mut mt-1">Data base: {data} · atualiza a cada 10 min</p>
      </header>

      {erro && (
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-[11px] text-danger">{erro}</div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-line bg-panel p-2">
          <p className="font-display text-xl font-extrabold text-ink">{analisados.length}</p>
          <p className="text-[9px] text-mut uppercase">jogos analisados</p>
        </div>
        <div className="rounded-xl border border-line bg-panel p-2">
          <p className="font-display text-xl font-extrabold text-acc">{comAlta}</p>
          <p className="text-[9px] text-mut uppercase">confiança alta</p>
        </div>
        <div className="rounded-xl border border-line bg-panel p-2">
          <p className="font-display text-xl font-extrabold text-purple">{oportunidades.length}</p>
          <p className="text-[9px] text-mut uppercase">oportunidades</p>
        </div>
      </div>

      {/* Oportunidades de valor — com filtro de mercado (Tudo/Gols/Cartões/Escanteios) */}
      {oportunidades.length > 0 && <OportunidadesLista oportunidades={oportunidades} />}

      {/* Cupom do dia */}
      {cupom.length > 0 && (
        <section className="rounded-2xl border border-purple/40 bg-gradient-to-br from-purple/10 via-panel to-panel p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-extrabold uppercase tracking-wide text-purple">Cupom do dia</h2>
            <span className="text-[9px] text-mut">3 seleções</span>
          </div>
          <ol className="space-y-1.5">
            {cupom.map(({ a, destaque }, i) => (
              <li key={a.matchId} className="flex items-center gap-2 rounded-xl border border-line bg-panel2/70 px-2 py-1.5">
                <span className="w-5 h-5 shrink-0 rounded-full bg-purple/20 text-purple text-[10px] font-extrabold flex items-center justify-center">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-bold text-ink truncate">{a.home.name} × {a.away.name}</span>
                  <span className="block text-[9px] text-mut truncate">{leagueInfo(a.league).flag} {a.leagueName} · {horaSP(a.kickoff)}</span>
                </span>
                <span className="text-right shrink-0">
                  <span className="block text-[10px] font-extrabold text-ink">{destaque.mercado}</span>
                  <span className="block text-[10px] font-extrabold text-purple tabular-nums">{pct(destaque.prob)}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Jogos */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-extrabold uppercase tracking-wide text-ink">Jogos em destaque</h2>
          <Link href="/apitou" className="text-[9px] text-acc font-bold">Ver todos →</Link>
        </div>

        {analisados.length === 0 && !erro && (
          <p className="text-[11px] text-mut text-center py-8 bg-panel border border-dashed border-line rounded-xl">
            Nenhum jogo com histórico suficiente agora. Volte mais perto do horário.
          </p>
        )}

        <div className="grid gap-2">
          {analisados.map((a) => {
            const op = opPorJogo.get(a.matchId);
            const destaque = melhorMercado(a.probs);
            return (
              <Link
                key={a.matchId}
                href={`/apitou?jogo=${a.matchId}&data=${data}`}
                className="block rounded-2xl border border-line bg-panel p-3 hover:border-acc/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-mut truncate">{leagueInfo(a.league).flag} {a.leagueName}</span>
                  <span className={`ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${a.estado.startsWith("AO VIVO") ? "bg-live/15 text-live border-live/40" : "bg-panel2 text-mut border-line"}`}>{a.estado}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${confCor[a.confianca] ?? confCor.baixa}`}>{a.confianca}</span>
                </div>

                <div className="flex items-center gap-2 mt-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-extrabold text-ink truncate">{a.home.name}</p>
                    <p className="text-[12px] font-extrabold text-ink truncate">{a.away.name}</p>
                  </div>
                  <div className="text-right text-[10px] tabular-nums text-mut shrink-0">
                    <p>{pct(a.probs.home)}</p>
                    <p>{pct(a.probs.away)}</p>
                  </div>
                </div>

                {/* Barra 1X2 */}
                <div className="mt-1.5 flex h-1.5 rounded-full overflow-hidden bg-line">
                  <div className="bg-home" style={{ width: `${a.probs.home * 100}%` }} />
                  <div className="bg-mut" style={{ width: `${a.probs.draw * 100}%` }} />
                  <div className="bg-away" style={{ width: `${a.probs.away * 100}%` }} />
                </div>

                <div className="flex gap-1.5 mt-2 flex-wrap">
                  <span className="text-[9px] bg-panel2 border border-line rounded px-1.5 py-0.5">Over 2.5 <b className="text-acc">{pct(a.probs.over25)}</b></span>
                  <span className="text-[9px] bg-panel2 border border-line rounded px-1.5 py-0.5">Ambas marcam <b className="text-acc">{pct(a.probs.btts)}</b></span>
                  {op ? (
                    <span className="text-[9px] bg-acc/10 border border-acc/40 rounded px-1.5 py-0.5 text-ink">
                      <PorqueValor probModelo={op.probModelo} odd={op.odd} evPct={op.evPct} />
                    </span>
                  ) : (
                    <span className="text-[9px] bg-panel2 border border-line rounded px-1.5 py-0.5">Destaque: {destaque.mercado} {pct(destaque.prob)}</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Legenda dos tipos de palpite */}
      <section className="rounded-2xl border border-line bg-panel/60 p-3">
        <h2 className="text-[10px] font-extrabold uppercase tracking-wide text-ink mb-1.5">Tipos de palpite</h2>
        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
          <div className="bg-panel2 rounded-lg p-2"><b className="text-ink">MS / 1X2</b><p className="text-[9px] text-mut">Vitória casa, empate ou fora.</p></div>
          <div className="bg-panel2 rounded-lg p-2"><b className="text-ink">Alt/Üst</b><p className="text-[9px] text-mut">Mais ou menos gols (linha 2.5).</p></div>
          <div className="bg-panel2 rounded-lg p-2"><b className="text-ink">KG Var</b><p className="text-[9px] text-mut">Ambas as equipes marcam.</p></div>
          <div className="bg-panel2 rounded-lg p-2"><b className="text-ink">Value Bet</b><p className="text-[9px] text-mut">Modelo &gt; odd paga (edge + EV).</p></div>
        </div>
        <p className="text-[9px] text-mut leading-relaxed mt-2">
          Probabilidades estatísticas, não odds nem garantia de acerto. O destaque é o mercado
          mais provável do modelo para o jogo.
        </p>
      </section>

      <footer className="text-center text-[9px] text-mut pb-4">
        MVP de recon clean-room do Gol Sinyali · dados ESPN + API-Football + motor próprio ·{" "}
        <Link href="/desempenho" className="text-acc">ver histórico de acerto</Link>
      </footer>
    </main>
  );
}
