import { NextRequest, NextResponse } from "next/server";
import { hubOddsPorEspnId } from "@/lib/hub/queries";

export const dynamic = "force-dynamic";

/**
 * GET /api/matches/[id]/odds-casas
 *
 * Rota FINA da Pré-Live: comparativo de odds entre casas (Pinnacle, Bet365,
 * 1xBet e as demais que a Sportmonks devolveu) para o jogo da ESPN em `[id]`.
 *
 * Só cache: lê `hub_bookmaker_odd` pela fixture vinculada ao id da ESPN. Nada
 * de fornecedor nem de recálculo — a mesma leitura que `/hub/[id]` faz. Jogo
 * não sincronizado → 200 com `found: false` e lista vazia.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await hubOddsPorEspnId(id);

  return NextResponse.json({
    found: r.comparativos.length > 0,
    fixtureId: r.fixtureId,
    totalCasas: r.totalCasas,
    comparativos: r.comparativos,
  });
}
