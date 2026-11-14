import { NextRequest, NextResponse } from "next/server";
import { cardsFor, todayYmd } from "@/lib/supertips";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const sport = sp.get("sport") || "football";
  const date = (sp.get("date") || todayYmd()).replace(/-/g, "");
  if (!["football", "nba", "tennis"].includes(sport)) return NextResponse.json({ error: "Esporte inválido." }, { status: 400 });
  try {
    const cards = await cardsFor(sport, date, sp.get("voter") || undefined);
    return NextResponse.json({ sport, date, cards, source: "ESPN" });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha ao montar os jogos.", cards: [] }, { status: 200 });
  }
}