import { NextRequest, NextResponse } from "next/server";
import { getSummaryRaw, matchFromSummary, normOdds } from "@/lib/espn";
import { analyzeMatch } from "@/lib/engine";
import { projetarGols } from "@/lib/golsLadder";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const league = req.nextUrl.searchParams.get("league") || "bra.1";
  const user = await getUser();
  const vip = !!user && (user.isAdmin || user.access.active);
  try {
    const sm = await getSummaryRaw(league, id, "in");
    const match = matchFromSummary(sm, league, id);
    const { analysis, h2h, veredito, sampleInfo } = await analyzeMatch(match);
    // Ladder de gols: Poisson sobre o λ total do confronto. A odd só entra se a
    // fonte publicar o par Over/Under da MESMA linha (sem par não há de-vig).
    const ladder =
      analysis.status === "ok" ? projetarGols(analysis.lambdaHome + analysis.lambdaAway, normOdds(sm)) : [];
    const ladderInfo = { lambdaTotal: +(analysis.lambdaHome + analysis.lambdaAway).toFixed(2), linhas: ladder };
    if (!vip && analysis.status === "ok") {
      return NextResponse.json({ locked: true, status: analysis.status, model_type: analysis.model_type, sample: analysis.sample, updatedAt: analysis.updatedAt, ladder: ladderInfo });
    }
    return NextResponse.json({ locked: false, ...analysis, veredito, ladder: ladderInfo, h2h: h2h.games?.slice(0, 6), sampleInfo, match: { id: match.id, home: match.home.name, away: match.away.name } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha na análise.", status: "erro" }, { status: 502 });
  }
}