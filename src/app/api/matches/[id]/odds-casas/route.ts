import { NextRequest, NextResponse } from "next/server";
import { hubOddsPorEspnId } from "@/lib/hub/queries";
import { getUser } from "@/lib/auth";

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
 *
 * ACESSO: o comparativo de casas é conteúdo do produto, então exige conta
 * ativa/admin (mesma regra de `/props`). O 402/403 devolve `found: false` e
 * `comparativos: []` porque `OddsMultiCasaLive` esconde a seção nesse estado.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  // 1) Gate VIP: o mesmo de `/api/matches/[id]/props`.
  const user = await getUser().catch(() => null);
  if (!user || !(user.isAdmin || user.access.active)) {
    return NextResponse.json(
      {
        locked: true,
        error: "Conteúdo VIP. Entre com uma conta ativa para comparar as odds das casas.",
        found: false,
        totalCasas: 0,
        comparativos: [],
      },
      { status: user ? 402 : 403 },
    );
  }

  const r = await hubOddsPorEspnId(id);

  return NextResponse.json({
    found: r.comparativos.length > 0,
    fixtureId: r.fixtureId,
    totalCasas: r.totalCasas,
    comparativos: r.comparativos,
  });
}
