import { NextRequest, NextResponse } from "next/server";
import { getSummaryRaw, normStats, matchFromSummary } from "@/lib/espn";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("q") || "";
  const pairs = raw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12);
  const boxes: Record<string, any> = {};
  await Promise.all(pairs.map(async (pair) => {
    const [id, league] = pair.split(":");
    if (!id || !league) return;
    try {
      const sm = await getSummaryRaw(league, id, "in");
      const match = matchFromSummary(sm, league, id);
      const stats = normStats(sm, match.home.id);
      const num = (key: string, side: "home" | "away") => {
        const row = stats.find((s) => s.key === key);
        const v = row ? (side === "home" ? row.home : row.away) : null;
        return v == null ? null : parseFloat(String(v).replace("%", ""));
      };
      const sum = (key: string) => {
        const h = num(key, "home");
        const a = num(key, "away");
        if (h == null && a == null) return null;
        return (h || 0) + (a || 0);
      };
      boxes[id] = {
        corners: sum("wonCorners"),
        fouls: sum("foulsCommitted"),
        yellow: sum("yellowCards"),
        red: sum("redCards"),
        offsides: sum("offsides"),
        shots: sum("totalShots"),
        sot: sum("shotsOnTarget"),
        goals: match.home.score != null && match.away.score != null ? `${match.home.score}-${match.away.score}` : null,
        source: "ESPN",
        updatedAt: new Date().toISOString(),
      };
    } catch {
      boxes[id] = null;
    }
  }));
  return NextResponse.json({ boxes, source: "ESPN" });
}