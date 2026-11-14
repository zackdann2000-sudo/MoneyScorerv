import { NextRequest, NextResponse } from "next/server";
import { scanLiveAlerts, recentAlerts } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const since = parseInt(req.nextUrl.searchParams.get("since") || "0") || 0;
  await scanLiveAlerts().catch(() => {});
  return NextResponse.json({ alerts: recentAlerts(since), now: Date.now() });
}