import { NextRequest, NextResponse } from "next/server";
import { aiPicks, nbaProps, todayYmd } from "@/lib/supertips";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const sport = sp.get("sport") || "football";
  const date = (sp.get("date") || todayYmd()).replace(/-/g, "");
  try {
    if (sport === "nba") return NextResponse.json(await nbaProps());
    const data = await aiPicks(date);
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha nos palpites.", blocks: [], props: [] }, { status: 200 });
  }
}