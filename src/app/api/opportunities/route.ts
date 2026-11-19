import { NextRequest, NextResponse } from "next/server";
import { analisarOportunidades } from "@/lib/opportunitiesEngine";

export const dynamic = "force-dynamic";

/**
 * GET /api/opportunities?date=YYYY-MM-DD&limit=30&minProb=0.65&maxMatches=8&principais=1
 *
 * Devolve as oportunidades de valor (modelo Poisson × odds de mercado) do dia,
 * mais os jogos já avaliados para a UI reaproveitar as probabilidades.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const date = sp.get("date") || undefined;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date inválido, use YYYY-MM-DD" }, { status: 400 });
  }
  const num = (k: string, def?: number) => {
    const v = sp.get(k);
    if (v == null || v === "") return def;
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  };

  try {
    const result = await analisarOportunidades({
      date,
      limit: num("limit", 30),
      minProb: num("minProb", 0.65),
      maxMatches: num("maxMatches", 8),
      principais: sp.get("principais") === "1",
    });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha ao calcular oportunidades." }, { status: 502 });
  }
}
