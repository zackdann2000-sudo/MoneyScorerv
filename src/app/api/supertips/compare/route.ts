import { NextRequest, NextResponse } from "next/server";
import { comparePayload, indicators } from "@/lib/supertips";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const id = sp.get("id") || "";
  const league = sp.get("league") || "bra.1";
  if (!id) return NextResponse.json({ error: "Partida inválida." }, { status: 400 });
  try {
    const data = await comparePayload(league, id);
    const user = await getUser();
    const vip = !!user && (user.isAdmin || user.access.active);
    const lineups = vip || !data.lineups ? data.lineups : {
      ...data.lineups,
      home: data.lineups.home ? { ...data.lineups.home, xi: [], bench: [] } : null,
      away: data.lineups.away ? { ...data.lineups.away, xi: [], bench: [] } : null,
    };
    const ind = await indicators(league, data.match.home.id, data.match.away.id).catch(() => null);
    return NextResponse.json({ ...data, lineups, indicators: ind, vip });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha no comparativo." }, { status: 502 });
  }
}