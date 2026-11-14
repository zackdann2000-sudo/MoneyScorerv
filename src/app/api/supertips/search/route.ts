import { NextRequest, NextResponse } from "next/server";
import { LEAGUES } from "@/lib/espn";
import { fetchJson } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ leagues: [], hits: [] });
  const leagues = LEAGUES.filter((l) => `${l.name} ${l.country}`.toLowerCase().includes(q.toLowerCase()));
  let hits: any[] = [];
  try {
    const data = await fetchJson(`https://site.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(q)}&limit=8`, {}, 120000);
    const items = data?.items || data?.results || data?.athletes || [];
    hits = (Array.isArray(items) ? items : []).slice(0, 8).map((it: any) => ({
      type: it.type || it.kind || "item",
      name: it.displayName || it.name || it.title || "",
      league: it.league || it.subtitle || "",
      id: String(it.id || ""),
      logo: it.logo || it.headshot?.href || "",
    })).filter((h: any) => h.name);
  } catch { /* busca ESPN opcional */ }
  return NextResponse.json({ leagues, hits, source: "ESPN" });
}