/**
 * Detalhe de um jogo: palpites, placar previsto, estatísticas modelo x real,
 * gols e H2H.
 *
 * GET /api/nerdytips/partida/{id}
 *
 * O site responde em /match-details/<slug>-<id>; pedir só o id faz o redirect
 * para o slug certo (301 -> 200), então não precisamos conhecer o slug.
 */
import { NextRequest, NextResponse } from "next/server";
import { parsePartida } from "@/lib/nerdytips/fonte";
import { CACHE_TTL_MS, comCache } from "@/lib/nerdytips/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d{3,12}$/.test(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  try {
    const r = await comCache(`partida:${id}`, `/match-details/${id}`, parsePartida);
    return NextResponse.json({
      ...r.dados,
      cache: {
        source: r.cache,
        ageSeconds: Math.round(r.idadeMs / 1000),
        ttlSeconds: CACHE_TTL_MS / 1000,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "falha ao buscar a partida" },
      { status: 502 },
    );
  }
}
