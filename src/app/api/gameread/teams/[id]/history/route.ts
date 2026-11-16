/**
 * Histórico dos últimos N jogos de um time — alimenta o gráfico de barras.
 *
 *   GET /api/gameread/teams/{id}/history?lastN=10
 *
 * O endpoint `/teams/{id}/game-log` já devolve as métricas em pares
 * `{ for, against }` por jogo. Aqui só normalizamos: uma linha por partida, com
 * os campos de time já achatados e o adversário/resutado para o eixo do gráfico.
 */
import { NextRequest, NextResponse } from "next/server";
import { cachedGameRead, CACHE_TTL_MS } from "@/lib/gameread";

export const dynamic = "force-dynamic";

/** Métricas que valem um gráfico (as demais seriam ruído visual). */
const PLOTTABLE = [
  "goals",
  "shotsTotal",
  "shotsOnTarget",
  "expectedGoals",
  "cornerKicks",
  "ballPossession",
  "fouls",
  "yellowCards",
  "totalPasses",
  "tackles",
  "goalkeeperSaves",
  "offsides",
] as const;

type Pair = { for?: number | null; against?: number | null };

type LogEntry = {
  fixtureId: string;
  kickoff?: string;
  round?: string | null;
  isHome?: boolean;
  opponent?: { id?: string; name?: string; logoUrl?: string };
  result?: string | null;
  league?: { name?: string };
} & Record<string, unknown>;

function pairValue(v: unknown): Pair | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Pair;
  return { for: typeof o.for === "number" ? o.for : null, against: typeof o.against === "number" ? o.against : null };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sp = req.nextUrl.searchParams;
  const lastN = Math.min(Math.max(Number(sp.get("lastN") ?? 10), 1), 30);
  const revalidate = sp.get("revalidate") === "1";

  try {
    const res = await cachedGameRead<LogEntry[]>(
      "team_history",
      `/teams/${encodeURIComponent(id)}/game-log?lastN=${lastN}`,
      { revalidate, dateKey: id },
    );

    const entries = Array.isArray(res.data) ? res.data : [];

    // A API devolve do mais recente para o mais antigo. O gráfico lê melhor em
    // ordem cronológica, então invertemos.
    const chrono = [...entries].reverse();

    // Descobre quais métricas realmente têm dado nesta resposta.
    const available = PLOTTABLE.filter((k) =>
      chrono.some((e) => {
        const p = pairValue(e[k]);
        return p && (p.for != null || p.against != null);
      }),
    );

    const games = chrono.map((e) => {
      const metrics: Record<string, Pair | null> = {};
      for (const key of available) metrics[key] = pairValue(e[key]);

      return {
        fixtureId: e.fixtureId,
        date: e.kickoff ?? null,
        result: (e.result as string | null) ?? null,
        isHome: e.isHome === true,
        opponentName: e.opponent?.name ?? "",
        opponentLogo: e.opponent?.logoUrl ?? "",
        round: (e.round as string | null) ?? null,
        metrics,
      };
    });

    return NextResponse.json({
      teamId: id,
      count: games.length,
      available,
      games,
      cache: {
        source: res.source,
        ageSeconds: Math.round(res.ageMs / 1000),
        ttlSeconds: CACHE_TTL_MS / 1000,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "falha ao buscar histórico", games: [], available: [] },
      { status: 502 },
    );
  }
}
