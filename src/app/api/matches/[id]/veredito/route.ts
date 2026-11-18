import { NextRequest, NextResponse } from "next/server";
import { getSummaryRaw, getTeamHistory, matchFromSummary, type HistGame } from "@/lib/espn";
import { cached } from "@/lib/cache";
import { gerarVeredito } from "@/lib/veredito";

export const dynamic = "force-dynamic";

/* O raio-X é o mesmo que /api/teams/[id] já usa (últimos 10 jogos com placar).
   Vinte minutos de cache: o histórico de um time não muda no meio do dia. */
const TTL = 20 * 60 * 1000;

const vazio = { games: [] as HistGame[], baseParcial: true, source: "ESPN" };

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const league = req.nextUrl.searchParams.get("league") || "bra.1";

  try {
    const data = await cached(`veredito:${league}:${id}`, TTL, async () => {
      const sm = await getSummaryRaw(league, id, "in");
      if (!sm?.header) throw new Error("Partida não encontrada nesta liga.");
      const match = matchFromSummary(sm, league, id);

      /* Um lado sem histórico não derruba o veredito: a função sabe lidar com
         base parcial e avisa na explicação. */
      const [raioxCasa, raioxFora] = await Promise.all([
        getTeamHistory(league, match.home.id, 10).catch(() => vazio),
        getTeamHistory(league, match.away.id, 10).catch(() => vazio),
      ]);

      const veredito = gerarVeredito(match.home.name, match.away.name, raioxCasa.games, raioxFora.games);

      return {
        ...veredito,
        jogo: {
          id: match.id,
          casa: { id: match.home.id, nome: match.home.name },
          fora: { id: match.away.id, nome: match.away.name },
        },
        base: {
          jogosCasa: raioxCasa.games.length,
          jogosFora: raioxFora.games.length,
          parcial: raioxCasa.baseParcial || raioxFora.baseParcial,
          fonte: "ESPN",
        },
        updatedAt: new Date().toISOString(),
      };
    });

    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Falha ao montar o veredito.", updatedAt: new Date().toISOString() },
      { status: 502 },
    );
  }
}
