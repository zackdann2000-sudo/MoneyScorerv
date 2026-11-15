import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { matchTeamStatsCache } from "@/db/schema";
import { getSummaryRaw, matchFromSummary } from "@/lib/espn";
import { getKey } from "@/lib/keys";
import { afTeamStats, afFindFixtureId, afFixtureFinished, type TeamStatMetric } from "@/lib/providers";
import { cached } from "@/lib/cache";

export const dynamic = "force-dynamic";

/* Janelas de validade do cache (ms). */
const TTL_ENCERRADA = 24 * 60 * 60 * 1000; /* dado definitivo */
const TTL_AO_VIVO = 5 * 60 * 1000; /* muda a cada lance */

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const league = req.nextUrl.searchParams.get("league") || "bra.1";

  try {
    const sm = await getSummaryRaw(league, id, "in");
    if (!sm?.header) {
      return NextResponse.json({ error: "Partida não encontrada nesta liga." }, { status: 404 });
    }
    const match = matchFromSummary(sm, league, id);
    const encerrada = !!match.finished;
    const ttl = encerrada ? TTL_ENCERRADA : TTL_AO_VIVO;

    /* ---------- 1) Banco ---------- */
    let cacheMotivo = "miss";
    try {
      const rows = await db
        .select()
        .from(matchTeamStatsCache)
        .where(eq(matchTeamStatsCache.matchId, id))
        .limit(1);
      const row = rows[0];
      if (row) {
        const idade = Date.now() - new Date(row.updatedAt).getTime();
        const vale = idade < (row.finalizada ? TTL_ENCERRADA : TTL_AO_VIVO);
        if (vale) {
          return NextResponse.json({
            metrics: row.payload as TeamStatMetric[],
            source: row.source,
            cache: "hit",
            finalizada: row.finalizada,
            updatedAt: row.updatedAt,
          });
        }
        cacheMotivo = "expirado";
      }
    } catch {
      cacheMotivo = "banco-indisponivel";
    }

    /* ---------- 2) Partida não iniciada: não gasta cota ---------- */
    if (!match.live && !match.finished) {
      return NextResponse.json({
        metrics: [],
        pendente: true,
        cache: cacheMotivo,
        mensagem: "As estatísticas comparativas aparecem assim que a bola rolar.",
        updatedAt: new Date().toISOString(),
      });
    }

    /* ---------- 3) API-Football ---------- */
    const chave = await getKey("api-football").catch(() => "");
    if (!chave) {
      return NextResponse.json({
        metrics: [],
        cache: cacheMotivo,
        error: "Chave da API-Football não configurada.",
      });
    }

    const achado = await cached(
      `afx:${id}:${match.date}`,
      24 * 60 * 60 * 1000,
      () => afFindFixtureId(match.home.name, match.away.name, match.date)
    );

    if (!achado?.id) {
      return NextResponse.json({
        metrics: [],
        cache: cacheMotivo,
        error: "Partida não encontrada na API-Football (nome+data).",
      });
    }

    const { metrics } = await afTeamStats(achado.id);

    if (!metrics.length) {
      return NextResponse.json({
        metrics: [],
        cache: cacheMotivo,
        pendente: !encerrada && !match.live,
        mensagem: "Estatísticas comparativas ainda não publicadas para esta partida.",
      });
    }

    /* ---------- 4) Grava no banco ---------- */
    const fim = encerrada || (await afFixtureFinished(achado.id));
    try {
      await db
        .insert(matchTeamStatsCache)
        .values({
          matchId: id,
          league,
          source: "API-Football",
          fixtureId: achado.id,
          finalizada: fim,
          payload: metrics,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: matchTeamStatsCache.matchId,
          set: {
            source: "API-Football",
            fixtureId: achado.id,
            finalizada: fim,
            payload: metrics,
            updatedAt: new Date(),
          },
        });
    } catch {
      /* cache é otimização: não falha a resposta */
    }

    return NextResponse.json({
      metrics,
      source: "API-Football",
      cache: cacheMotivo,
      finalizada: fim,
      ttlMs: ttl,
      updatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Falha ao montar as estatísticas do time." },
      { status: 502 }
    );
  }
}
