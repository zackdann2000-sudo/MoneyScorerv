import { NextRequest, NextResponse } from "next/server";
import { getStandingsComFonte, leagueInfo } from "@/lib/espn";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const league = req.nextUrl.searchParams.get("league") || "bra.1";
  const res = await getStandingsComFonte(league);
  return NextResponse.json({
    league,
    name: leagueInfo(league).name,
    groups: res.data,
    /* Football-Data.org é a fonte primária; ESPN entra como fallback. */
    source: res.source,
    attempts: res.attempts,
  });
}
