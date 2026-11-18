/**
 * Desempenho público do NerdyTips (`/progress`).
 *
 * GET /api/nerdytips/progresso
 *
 * São os números que o próprio site publica: acerto geral, bankers, total de
 * jogos e a tabela mês a mês. Serve para o usuário checar a fonte antes de
 * confiar no palpite.
 */
import { NextResponse } from "next/server";
import { parseProgresso } from "@/lib/nerdytips/fonte";
import { CACHE_TTL_MS, comCache } from "@/lib/nerdytips/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    // O recorde muda uma vez por dia: cache bem mais longo que o board.
    const r = await comCache("progresso", "/progress", parseProgresso, 6 * 60 * 60 * 1000);
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
      { error: e instanceof Error ? e.message : "falha ao buscar desempenho", kpis: [], meses: [] },
      { status: 502 },
    );
  }
}
