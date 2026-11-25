import { NextRequest, NextResponse } from "next/server";
import { getSummaryRaw, matchFromSummary, getTeamHistory, type HistGame } from "@/lib/espn";
import { cached } from "@/lib/cache";
import { avaliarJogo, MERCADOS } from "@/lib/screener";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/* Mercados que a aba "Estatísticas do Jogo" mostra: só os que dependem de
   summary (cantos/cartões/impedimentos) + os de placar que ficam ao lado deles. */
const DA_ABA = MERCADOS.map((m) => m.id);

/**
 * Frequência por mercado para UM confronto.
 * Lê o histórico dos dois times (cache 20 min) e devolve a avaliação do motor
 * `lib/screener`. Nada aqui inventa número: mercado sem cobertura sai em
 * `semDado` e a UI mostra "sem dados".
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sp = req.nextUrl.searchParams;
  const league = sp.get("league") || "bra.1";
  const amostra = sp.get("amostra") === "5" ? 5 : 10;
  const mando = sp.get("mando") === "todos" ? "todos" : "contexto";
  const pedidos = (sp.get("mercados") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const mercados = pedidos.filter((m) => DA_ABA.includes(m));

  const gate = await rateLimit("freq-jogo", clientIp(req), { limit: 60, windowSec: 300 });
  if (!gate.ok) return NextResponse.json({ error: "Muitas consultas. Aguarde um instante." }, { status: 429 });

  try {
    const sm = await getSummaryRaw(league, id, "in");
    if (!sm?.header) return NextResponse.json({ error: "Partida não encontrada nesta liga." }, { status: 404 });
    const m = matchFromSummary(sm, league, id);

    const hist = (teamId: string) =>
      cached<{ games: HistGame[]; baseParcial: boolean; source: string }>(
        `freq:hist:${league}:${teamId}:${amostra}`,
        20 * 60_000,
        () => getTeamHistory(league, teamId, amostra)
      ).catch(() => ({ games: [] as HistGame[], baseParcial: true, source: "ESPN" }));

    const [casa, fora] = await Promise.all([hist(m.home.id), hist(m.away.id)]);
    const avaliacao = avaliarJogo(casa.games, fora.games, {
      mercados: mercados.length ? mercados : DA_ABA,
      amostra,
      mando,
    });

    return NextResponse.json({
      match: { id: m.id, league: m.league, leagueName: m.leagueName, home: m.home, away: m.away, date: m.date, state: m.state },
      amostra,
      mando,
      avaliacao,
      amostraCasa: casa.games.length,
      amostraFora: fora.games.length,
      baseParcial: casa.baseParcial || fora.baseParcial,
      fonte: "ESPN",
      updatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha ao calcular a frequência." }, { status: 502 });
  }
}
