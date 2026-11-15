import { NextRequest, NextResponse } from "next/server";
import { getSummaryRaw, normStats, matchFromSummary } from "@/lib/espn";
import { liveMatchesComFallback, type LiveGame } from "@/lib/providers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("q") || "";
  const pairs = raw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12);
  const boxes: Record<string, any> = {};

  /* Cascata: ESPN prioritária; se ela cair/limitar, o Bzzoiro assume na hora.
     Tentamos os dois em paralelo só para saber quem respondeu — o resultado
     da ESPN sempre vence quando existe. */
  const jogos = new Set(pairs.map((p) => p.split(":")[0]));
  const cascade = await liveMatchesComFallback(async (): Promise<LiveGame[]> => {
    /* ESPN "viva" = conseguir ler ao menos um box dos pedidos */
    const results = await Promise.all(
      pairs.map(async (pair) => {
        const [id, league] = pair.split(":");
        if (!id || !league) return null;
        try {
          const sm = await getSummaryRaw(league, id, "in");
          return sm?.header ? { id } : null;
        } catch {
          return null;
        }
      })
    );
    const alive = results.filter(Boolean);
    return alive.map((r) => ({ id: r!.id } as LiveGame));
  }).catch(() => ({ data: [], source: "indisponível", attempts: [] } as any));

  const bzzoiroLive = cascade.source.startsWith("Bzzoiro")
    ? cascade.data.filter((g: LiveGame) => jogos.has(String(g.id)))
    : [];

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
      /* ESPN falhou para este jogo → tenta a cópia do Bzzoiro */
      const bz = bzzoiroLive.find((g: LiveGame) => String(g.id) === id);
      boxes[id] = bz
        ? {
            corners: null,
            fouls: null,
            yellow: null,
            red: null,
            offsides: null,
            shots: null,
            sot: null,
            goals: bz.homeScore != null && bz.awayScore != null ? `${bz.homeScore}-${bz.awayScore}` : null,
            source: "Bzzoiro",
            live: bz.status,
            minute: bz.minute,
            updatedAt: new Date().toISOString(),
          }
        : null;
    }
  }));
  return NextResponse.json({
    boxes,
    source: cascade.source,
    fallbackUsed: cascade.source.startsWith("Bzzoiro"),
    attempts: cascade.attempts,
  });
}