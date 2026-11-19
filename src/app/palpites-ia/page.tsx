import Link from "next/link";
import { getAllMatches, getTeamHistory, leagueInfo } from "@/lib/espn";
import { runModel } from "@/lib/model";

/* MVP inspirado no core loop do Gol Sinyali (recon em replica/recon.md):
   home com os palpites do dia, cupom do dia e selo de confiança. Reusa o data
   layer (ESPN) e o motor Poisson/Dixon-Coles do MoneyScorer — nada de dado
   inventado, nada copiado do original. */

export const revalidate = 600; // a página se atualiza a cada 10 min

function hojeSP(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
function horaSP(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}
const pct = (v: number) => `${Math.round(v * 100)}%`;

type Previsao = {
  id: string;
  liga: string;
  bandeira: string;
  estado: string;
  hora: string;
  casa: string;
  fora: string;
  logoCasa: string;
  logoFora: string;
  probs: { home: number; draw: number; away: number; over25: number; under25: number; btts: number };
  confianca: string;
  melhor: { mercado: string; prob: number };
};

export default async function PalpitesIaPage() {
  const data = hojeSP();

  let previsoes: Previsao[] = [];
  let erro = "";
  try {
    const todos = await getAllMatches(data);
    // Prioriza ligas relevantes e jogos ainda não encerrados.
    const cands = todos
      .filter((m) => m.state !== "post")
      .sort((a, b) => leagueInfo(a.league).priority - leagueInfo(b.league).priority || a.date.localeCompare(b.date))
      .slice(0, 6);

    const settled = await Promise.allSettled(
      cands.map(async (m): Promise<Previsao | null> => {
        const [hh, ah] = await Promise.all([
          getTeamHistory(m.league, m.home.id, 10),
          getTeamHistory(m.league, m.away.id, 10),
        ]);
        const a = runModel(m.home.name, m.away.name, hh.games, ah.games, 2.65);
        if (a.status !== "ok" || !a.probs) return null;
        const p = a.probs;
        const res = [
          { mercado: "Casa", prob: p.home },
          { mercado: "Empate", prob: p.draw },
          { mercado: "Fora", prob: p.away },
        ].sort((x, y) => y.prob - x.prob)[0];
        const exib = [
          res,
          { mercado: p.over25 >= p.under25 ? "Over 2.5" : "Under 2.5", prob: Math.max(p.over25, p.under25) },
          { mercado: p.btts >= 1 - p.btts ? "Ambas marcam" : "Não ambas", prob: Math.max(p.btts, 1 - p.btts) },
        ].sort((x, y) => y.prob - x.prob)[0];
        return {
          id: m.id,
          liga: m.leagueName,
          bandeira: leagueInfo(m.league).flag,
          estado: m.state === "in" ? `AO VIVO ${m.clock}` : horaSP(m.date),
          hora: horaSP(m.date),
          casa: m.home.name,
          fora: m.away.name,
          logoCasa: m.home.logo,
          logoFora: m.away.logo,
          probs: { home: p.home, draw: p.draw, away: p.away, over25: p.over25, under25: p.under25, btts: p.btts },
          confianca: a.confidence,
          melhor: { mercado: exib.mercado, prob: exib.prob },
        };
      }),
    );

    previsoes = settled
      .filter((r): r is PromiseFulfilledResult<Previsao | null> => r.status === "fulfilled")
      .map((r) => r.value)
      .filter((v): v is Previsao => v !== null);
  } catch (e: any) {
    erro = e?.message || "Não foi possível carregar os jogos agora.";
  }

  const confCor: Record<string, string> = {
    alta: "bg-acc/15 text-acc border-acc/40",
    média: "bg-warn/15 text-warn border-warn/40",
    baixa: "bg-danger/15 text-danger border-danger/40",
  };

  // Cupom do dia: os 3 jogos com o palpite mais forte.
  const cupom = [...previsoes].sort((a, b) => b.melhor.prob - a.melhor.prob).slice(0, 3);
  const comAlta = previsoes.filter((p) => p.confianca === "alta").length;

  return (
    <main className="mx-auto max-w-screen-md px-3 py-4 space-y-4">
      {/* Hero */}
      <header className="rounded-2xl border border-line bg-gradient-to-br from-purple/15 via-panel to-panel p-4">
        <p className="text-[10px] font-extrabold uppercase tracking-wide text-purple">Palpites por IA</p>
        <h1 className="font-display text-2xl font-extrabold text-ink leading-tight mt-1">
          Palpites de futebol de hoje
        </h1>
        <p className="text-[11px] text-mut mt-1">
          Probabilidades de 1X2, Over/Under e ambas marcam, geradas pelo motor Poisson/Dixon-Coles.
        </p>
        <p className="text-[9px] text-acc/90 mt-2 flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-acc" />
          Modelo ajustado com peso para a forma recente (últimos 10 jogos)
        </p>
        <p className="text-[9px] text-mut mt-1">Data base: {data} · atualiza a cada 10 min</p>
      </header>

      {erro && (
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-[11px] text-danger">
          {erro}
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-line bg-panel p-2">
          <p className="font-display text-xl font-extrabold text-ink">{previsoes.length}</p>
          <p className="text-[9px] text-mut uppercase">jogos analisados</p>
        </div>
        <div className="rounded-xl border border-line bg-panel p-2">
          <p className="font-display text-xl font-extrabold text-acc">{comAlta}</p>
          <p className="text-[9px] text-mut uppercase">confiança alta</p>
        </div>
        <div className="rounded-xl border border-line bg-panel p-2">
          <p className="font-display text-xl font-extrabold text-purple">3</p>
          <p className="text-[9px] text-mut uppercase">no cupom</p>
        </div>
      </div>

      {/* Cupom do dia */}
      {cupom.length > 0 && (
        <section className="rounded-2xl border border-acc/40 bg-gradient-to-br from-acc/10 via-panel to-panel p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-extrabold uppercase tracking-wide text-acc">Cupom do dia</h2>
            <span className="text-[9px] text-mut">3 seleções</span>
          </div>
          <ol className="space-y-1.5">
            {cupom.map((p, i) => (
              <li key={p.id} className="flex items-center gap-2 rounded-xl border border-line bg-panel2/70 px-2 py-1.5">
                <span className="w-5 h-5 shrink-0 rounded-full bg-acc/20 text-acc text-[10px] font-extrabold flex items-center justify-center">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-bold text-ink truncate">{p.casa} × {p.fora}</span>
                  <span className="block text-[9px] text-mut truncate">{p.bandeira} {p.liga} · {p.hora}</span>
                </span>
                <span className="text-right shrink-0">
                  <span className="block text-[10px] font-extrabold text-ink">{p.melhor.mercado}</span>
                  <span className="block text-[10px] font-extrabold text-acc tabular-nums">{pct(p.melhor.prob)}</span>
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

        {previsoes.length === 0 && !erro && (
          <p className="text-[11px] text-mut text-center py-8 bg-panel border border-dashed border-line rounded-xl">
            Nenhum jogo com histórico suficiente agora. Volte mais perto do horário.
          </p>
        )}

        <div className="grid gap-2">
          {previsoes.map((p) => (
            <Link
              key={p.id}
              href={`/apitou?jogo=${p.id}&data=${data}`}
              className="block rounded-2xl border border-line bg-panel p-3 hover:border-acc/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-mut truncate">{p.bandeira} {p.liga}</span>
                <span className={`ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${p.estado.startsWith("AO VIVO") ? "bg-live/15 text-live border-live/40" : "bg-panel2 text-mut border-line"}`}>{p.estado}</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${confCor[p.confianca] ?? confCor.baixa}`}>{p.confianca}</span>
              </div>

              <div className="flex items-center gap-2 mt-1.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-extrabold text-ink truncate">{p.casa}</p>
                  <p className="text-[12px] font-extrabold text-ink truncate">{p.fora}</p>
                </div>
                <div className="text-right text-[10px] tabular-nums text-mut shrink-0">
                  <p>{pct(p.probs.home)}</p>
                  <p>{pct(p.probs.away)}</p>
                </div>
              </div>

              {/* Barra 1X2 */}
              <div className="mt-1.5 flex h-1.5 rounded-full overflow-hidden bg-line">
                <div className="bg-home" style={{ width: `${p.probs.home * 100}%` }} />
                <div className="bg-mut" style={{ width: `${p.probs.draw * 100}%` }} />
                <div className="bg-away" style={{ width: `${p.probs.away * 100}%` }} />
              </div>

              <div className="flex gap-1.5 mt-2 flex-wrap">
                <span className="text-[9px] bg-panel2 border border-line rounded px-1.5 py-0.5">Over 2.5 <b className="text-acc">{pct(p.probs.over25)}</b></span>
                <span className="text-[9px] bg-panel2 border border-line rounded px-1.5 py-0.5">Ambas marcam <b className="text-acc">{pct(p.probs.btts)}</b></span>
                <span className="text-[9px] bg-acc/10 border border-acc/40 rounded px-1.5 py-0.5 text-acc">Destaque: {p.melhor.mercado} {pct(p.melhor.prob)}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Legenda dos tipos de palpite */}
      <section className="rounded-2xl border border-line bg-panel/60 p-3">
        <h2 className="text-[10px] font-extrabold uppercase tracking-wide text-ink mb-1.5">Tipos de palpite</h2>
        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
          <div className="bg-panel2 rounded-lg p-2"><b className="text-ink">MS / 1X2</b><p className="text-[9px] text-mut">Vitória casa, empate ou fora.</p></div>
          <div className="bg-panel2 rounded-lg p-2"><b className="text-ink">Alt/Üst</b><p className="text-[9px] text-mut">Mais ou menos gols (linha 2.5).</p></div>
          <div className="bg-panel2 rounded-lg p-2"><b className="text-ink">KG Var</b><p className="text-[9px] text-mut">Ambas as equipes marcam.</p></div>
          <div className="bg-panel2 rounded-lg p-2"><b className="text-ink">Time marca</b><p className="text-[9px] text-mut">Probabilidade de cada lado balançar a rede.</p></div>
        </div>
        <p className="text-[9px] text-mut leading-relaxed mt-2">
          Probabilidades estatísticas, não odds nem garantia de acerto. O destaque é o mercado
          mais provável do modelo para o jogo.
        </p>
      </section>

      <footer className="text-center text-[9px] text-mut pb-4">
        MVP de recon clean-room do Gol Sinyali · dados ESPN + motor próprio ·{" "}
        <Link href="/desempenho" className="text-acc">ver histórico de acerto</Link>
      </footer>
    </main>
  );
}
