import { NextRequest, NextResponse } from "next/server";
import { getAllMatches, todayYmd } from "@/lib/espn";
import { scanLiveAlertaSafe } from "@/lib/alertScan";
import { attachStrategies } from "@/lib/listStrategy";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const date = (sp.get("date") || todayYmd()).replace(/-/g, "");
  const leagues = sp.get("leagues")?.split(",").filter(Boolean);
  const liveOnly = sp.get("live") === "1";
  const raw = await getAllMatches(date, leagues);
  const withTips = await attachStrategies(raw).catch(() => raw.map((m) => ({ ...m, strategy: null })));
  if (liveOnly || withTips.some((m) => m.live)) scanLiveAlertaSafe();
  const matches = liveOnly ? withTips.filter((m) => m.live) : withTips;
  return NextResponse.json({
    date, now: Date.now(), count: matches.length, live: matches.filter((m) => m.live).length,
    matches, source: "ESPN",
  });
}