import { NextRequest, NextResponse } from "next/server";
import { getSummaryRaw, matchFromSummary, normEvents, normStats, normLineups, normH2H, normForm, normOdds } from "@/lib/espn";
import { getUser } from "@/lib/auth";
import { attachStrategies } from "@/lib/listStrategy";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const league = req.nextUrl.searchParams.get("league") || "bra.1";
  try {
    const sm = await getSummaryRaw(league, id, "in");
    if (!sm?.header) return NextResponse.json({ error: "Partida não encontrada nesta liga." }, { status: 404 });
    const match = matchFromSummary(sm, league, id);
    const [enriched] = await attachStrategies([match]).catch(() => [{ ...match, strategy: null }]);
    const user = await getUser();
    const vip = !!user && (user.isAdmin || user.access.active);
    const lineups = normLineups(sm, match.home.id);
    const commentary = (sm?.commentary?.items || []).slice(-20).map((c: any) => ({ minute: c?.time?.displayValue || "", text: c?.text || "" })).reverse();
    const officials = (sm?.gameInfo?.officials || []).map((o: any) => ({ name: o?.displayName || o?.fullName || "", role: o?.position?.displayName || "Árbitro", photo: o?.headshot?.href || "" }));
    return NextResponse.json({
match: enriched, strategy: enriched.strategy,
      events: normEvents(sm, match.home.id, match.away.id),
      stats: normStats(sm, match.home.id),
      lineups: vip ? lineups : { ...lineups, home: lineups.home ? { ...lineups.home, xi: [], bench: [] } : null, away: lineups.away ? { ...lineups.away, xi: [], bench: [] } : null },
      hasLineups: lineups.official,
      vip,
      form: normForm(sm, match.home.id),
      h2h: normH2H(sm),
      odds: normOdds(sm),
      officials,
      commentary,
      venue: sm?.gameInfo?.venue?.fullName || match.venue || "",
      source: "ESPN", updatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha ao buscar detalhes." }, { status: 502 });
  }
}