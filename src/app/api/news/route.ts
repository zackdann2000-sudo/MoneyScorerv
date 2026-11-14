import { NextResponse } from "next/server";
import { fetchJson } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET() {
  const codes = ["bra.1", "eng.1", "esp.1"];
  const articles: any[] = [];
  for (const code of codes) {
    try {
      const data = await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${code}/news?limit=6`, {}, 600000);
      for (const a of data?.articles || []) {
        articles.push({
          id: String(a.id || a.headline),
          title: a.headline || a.title || "",
          description: a.description || "",
          published: a.published || a.lastModified || null,
          link: a.links?.web?.href || "",
          league: code,
          source: "ESPN",
        });
      }
    } catch { /* liga sem feed */ }
  }
  articles.sort((a, b) => String(b.published || "").localeCompare(String(a.published || "")));
  return NextResponse.json({ articles: articles.slice(0, 20), updatedAt: new Date().toISOString(), source: "ESPN" });
}