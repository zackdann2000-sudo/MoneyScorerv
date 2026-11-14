import { NextRequest, NextResponse } from "next/server";
import { getStandings, leagueInfo } from "@/lib/espn";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const league = req.nextUrl.searchParams.get("league") || "bra.1";
  const groups = await getStandings(league);
  return NextResponse.json({ league, name: leagueInfo(league).name, groups, source: "ESPN" });
}