/**
 * Bet of the Day + Slip do dia.
 *
 * GET /api/nerdytips/destaques
 *
 * Mesmo board de palpites, mais os contadores (bankers, próximos, acerto) e o
 * slip pronto que o site mostra na aba "Slip of the Day".
 */
import { NextResponse } from "next/server";
import { parseDestaques } from "@/lib/nerdytips/fonte";
import { CACHE_TTL_MS, comCache } from "@/lib/nerdytips/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const r = await comCache("v2:destaques", "/bet-of-the-day", parseDestaques);
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
      { error: e instanceof Error ? e.message : "falha ao buscar destaques", jogos: [], ligas: [] },
      { status: 502 },
    );
  }
}
