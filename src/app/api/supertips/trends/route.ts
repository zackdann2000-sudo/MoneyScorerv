import { NextRequest, NextResponse } from "next/server";
import { trends, todayYmd } from "@/lib/supertips";
import { getPickDoDia } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const date = (req.nextUrl.searchParams.get("date") || todayYmd()).replace(/-/g, "");
  try {
    const [data, pick] = await Promise.all([
      trends(date),
      getPickDoDia(date).catch(() => null),
    ]);
    return NextResponse.json({ ...data, pick: pick?.pick || null, melhores: pick?.melhores || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha nas tendências.", cards: [] }, { status: 200 });
  }
}