/**
 * Resumo H2H para a aba Props — últimos 5 confrontos entre os dois times,
 * somando cartões e finalizações por lado (mandante/visitante do jogo de hoje).
 *
 * Fonte: ESPN (grátis, sem cota). Melhor esforço: confrontos de outras ligas
 * ou sem boxscore são ignorados — o resumo usa quantos jogos de fato coletou.
 */
import { getSummaryRaw, normH2H, normStats, type Match } from "./espn";

export type ResumoH2H = {
  jogos: number;
  cartoes: { mandante: number; visitante: number };
  finalizacoes: { mandante: number; visitante: number };
  fonte: string;
};

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export async function resumoH2HProps(
  league: string,
  matchId: string,
  homeName: string,
  awayName: string,
): Promise<ResumoH2H> {
  const out: ResumoH2H = { jogos: 0, cartoes: { mandante: 0, visitante: 0 }, finalizacoes: { mandante: 0, visitante: 0 }, fonte: "espn" };
  try {
    const sm = await getSummaryRaw(league, matchId, "pre");
    const h2h = sm ? normH2H(sm) : { games: [] };
    const jogos = (h2h.games || []).slice(0, 5);
    for (const g of jogos) {
      try {
        const gsm = await getSummaryRaw(league, g.id, "post");
        if (!gsm?.boxscore?.teams?.length) continue;
        const stats = normStats(gsm, g.homeId);
        const pick = (k: string) => {
          const r = stats.find((s: any) => s.key === k);
          return { h: r ? num(r.home) : 0, a: r ? num(r.away) : 0 };
        };
        const y = pick("yellowCards"), r = pick("redCards"), shots = pick("totalShots");
        if (y.h + r.h + y.a + r.a + shots.h + shots.a === 0) continue;
        // orienta para o jogo de hoje: quem é o mandante/visitante atual?
        const h2hMandanteEAtual = norm(g.homeName) === norm(homeName);
        const h = h2hMandanteEAtual ? y.h + r.h : y.a + r.a;
        const v = h2hMandanteEAtual ? y.a + r.a : y.h + r.h;
        const fh = h2hMandanteEAtual ? shots.h : shots.a;
        const fv = h2hMandanteEAtual ? shots.a : shots.h;
        out.cartoes.mandante += h;
        out.cartoes.visitante += v;
        out.finalizacoes.mandante += fh;
        out.finalizacoes.visitante += fv;
        out.jogos++;
      } catch {
        /* confronto sem summary disponível → ignora */
      }
    }
  } catch {
    /* sem H2H na origem */
  }
  return out;
}