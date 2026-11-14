import { NextRequest, NextResponse } from "next/server";
import { settleAndReport } from "@/lib/engine";
import { auditPicks } from "@/lib/credibility";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  try {
    const [model, audit] = await Promise.all([
      settleAndReport(),
      auditPicks({ period: sp.get("period") || "30", league: sp.get("league") || "all", market: sp.get("market") || "all" }),
    ]);
    return NextResponse.json({ ...model, audit });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message, last30: { total: 0, greens: 0, reds: 0, pending: 0, acc: null }, recent: [], picks: [], audit: null });
  }
}