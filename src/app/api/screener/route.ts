import { NextRequest, NextResponse } from "next/server";
import {
  getAllMatches,
  getTeamHistory,
  getTeamScheduleGames,
  todayYmd,
  type HistGame,
  type Match,
} from "@/lib/espn";
import { filtroLigasPrincipais } from "@/lib/mainLeagues";
import { cached } from "@/lib/cache";
import { avaliarJogo, MERCADOS } from "@/lib/screener";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/* =============================================================================
   SCREENER — "quais jogos da rodada batem estes mercados no histórico".

   Orçamento de fornecedor (prioridade máxima: proteger a cota do ESPN):
   • Etapa A (gols/resultado): 1 request por time (schedule), sem summary.
   • Etapa B (cantos/cartões/impedimentos): ~11 requests por time (summary).
     Por isso o teto da B é 8 jogos por chamada. Quem quer ver mais filtra por
     liga — nunca colocamos o usuário para esperar 20 s.
   ========================================================================== */

const TETO_A = 24;
const TETO_B = 8;

const IDS = new Set(MERCADOS.map((m) => m.id));

/* Histórico do time conforme a etapa. A chave do cache inclui a etapa: a B não
   pode reaproveitar um histórico sem summary (viria tudo `null`). */
async function historico(league: string, teamId: string, etapa: "A" | "B", amostra: 5 | 10) {
  const chave = `screener:hist:${etapa}:${league}:${teamId}:${amostra}`;
  const ttl = etapa === "B" ? 20 * 60_000 : 30 * 60_000;
  return cached<{ games: HistGame[]; baseParcial: boolean; source: string }>(chave, ttl, () =>
    etapa === "B" ? getTeamHistory(league, teamId, amostra) : getTeamScheduleGames(league, teamId, amostra)
  ).catch(() => ({ games: [] as HistGame[], baseParcial: true, source: "ESPN" }));
}

/** Concorrência baixa com espaçamento — o Akamai do ESPN devolve 403 em rajada. */
async function emLotes<T, R>(itens: T[], tamanho: number, fn: (i: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    const lote = itens.slice(i, i + tamanho);
    saida.push(...(await Promise.all(lote.map(fn))));
    if (i + tamanho < itens.length) await new Promise((r) => setTimeout(r, 120));
  }
  return saida;
}

export async function POST(req: NextRequest) {
  const gate = await rateLimit("screener", clientIp(req), { limit: 30, windowSec: 3600 });
  if (!gate.ok) return NextResponse.json({ error: "Limite de consultas. Tente em alguns minutos." }, { status: 429 });

  try {
    const body = await req.json();
    const date = String(body.date || todayYmd()).replace(/\D/g, "").slice(0, 8);
    const liga = String(body.liga || "all");
    const amostra: 5 | 10 = body.amostra === 5 ? 5 : 10;
    const limiar = Number.isFinite(Number(body.limiar)) ? Math.min(95, Math.max(40, Number(body.limiar))) : 60;

    const pedidos: string[] = Array.isArray(body.mercados) && body.mercados.length
      ? body.mercados.filter((m: unknown) => typeof m === "string" && IDS.has(m))
      : MERCADOS.filter((m) => m.etapa === "A").map((m) => m.id);

    if (!pedidos.length) return NextResponse.json({ error: "Nenhum mercado válido informado." }, { status: 400 });

    /* A etapa da resposta é a mais cara entre os mercados pedidos. */
    const etapa: "A" | "B" = pedidos.some((id) => MERCADOS.find((m) => m.id === id)?.etapa === "B") ? "B" : "A";
    const teto = etapa === "B" ? TETO_B : TETO_A;

    const chaveCache = `screener:${date}:${liga}:${amostra}:${etapa}:${limiar}:${pedidos.slice().sort().join(",")}`;
    const resposta = await cached(chaveCache, 15 * 60_000, async () => {
      let jogos = await getAllMatches(date, liga === "all" ? undefined : [liga]);
      jogos = jogos.filter((m) => m.state !== "post");
      // "principais" = catálogo real (`mainLeagues`), com as 18 ligas.
      if (liga === "all") jogos = jogos.filter(filtroLigasPrincipais);
      /* Jogos que já começaram entram (dado histórico não muda); o que não pode
         é analisar jogo encerrado. */
      const truncado = jogos.length > teto;
      jogos = jogos.slice(0, teto);

      const avaliados = await emLotes(jogos, 2, async (m: Match) => {
        const [casa, fora] = await Promise.all([
          historico(m.league, m.home.id, etapa, amostra),
          historico(m.league, m.away.id, etapa, amostra),
        ]);
        const av = avaliarJogo(casa.games, fora.games, { mercados: pedidos, amostra, limiar });
        return {
          match: {
            id: m.id, league: m.league, leagueName: m.leagueName, flag: m.flag,
            country: m.country, date: m.date, state: m.state, status: m.status,
            home: m.home, away: m.away,
          },
          avaliacao: av,
          amostraCasa: casa.games.length,
          amostraFora: fora.games.length,
        };
      });

      /* Só jogos com pelo menos um mercado aprovado; ordena pelo score. */
      const comAprovado = avaliados
        .filter((j) => j.avaliacao.aprovados.length > 0)
        .sort((a, b) => b.avaliacao.score - a.avaliacao.score || b.avaliacao.aprovados.length - a.avaliacao.aprovados.length);

      return {
        jogos: comAprovado,
        total: avaliados.length,
        semNada: avaliados.length - comAprovado.length,
        truncado,
        teto,
      };
    });

    return NextResponse.json({
      ...resposta,
      etapa,
      amostra,
      limiar,
      liga,
      pedidos,
      fonte: "ESPN",
      updatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha ao filtrar os jogos." }, { status: 502 });
  }
}

/** Metadados do painel: mercados por etapa + o que cada um conta. */
export async function GET() {
  return NextResponse.json({
    mercados: MERCADOS.map((m) => ({ id: m.id, label: m.label, etapa: m.etapa, criterio: m.criterio, linha: m.linha })),
    tetos: { A: TETO_A, B: TETO_B },
  });
}
