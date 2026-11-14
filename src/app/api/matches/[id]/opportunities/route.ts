import { NextRequest, NextResponse } from "next/server";
import { getSummaryRaw, matchFromSummary, getTeamHistory } from "@/lib/espn";
import { calcularOportunidades, desapitosDoTime, playerMatrix } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sp = req.nextUrl.searchParams;
  const league = sp.get("league") || "bra.1";
  const side = sp.get("side") === "away" ? "away" : "home";
  try {
    const sm = await getSummaryRaw(league, id, "in");
    const match = matchFromSummary(sm, league, id);
    const team = side === "home" ? match.home : match.away;
    const hist = await getTeamHistory(league, team.id, 10);
    const mando = sp.get("mando") === "1" ? side : undefined;
    return NextResponse.json({
      team: { id: team.id, name: team.name, logo: team.logo },
      oportunidades: calcularOportunidades(hist.games, mando),
      desapitos: desapitosDoTime(hist.games, side),
      matrix: playerMatrix(hist.games),
      jogos: hist.games.map((g) => ({ id: g.id, date: g.date, opp: g.opp, home: g.home, gf: g.gf, ga: g.ga, res: g.res })),
      amostra: hist.games.length, baseParcial: hist.baseParcial, fonte: "ESPN",
      updatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha ao calcular oportunidades." }, { status: 502 });
  }
}