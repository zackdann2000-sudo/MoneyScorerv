import { NextRequest, NextResponse } from "next/server";
import { hubInsightsPorEspnId } from "@/lib/hub/queries";

export const dynamic = "force-dynamic";

/**
 * GET /api/matches/[id]/insights
 *
 * Rota FINA da Pré-Live: devolve os caches do DumbleScore para o jogo da ESPN
 * informado em `[id]` — padrões estatísticos (`hub_analysis.lab_insights`),
 * fatores de xG (`hub_xg_factor`) e o relatório em linguagem natural gerado do
 * mesmo cache (`gerarRelatorio`, puro).
 *
 * Nada é recalculado e nenhum fornecedor é chamado: é o mesmo dado que a tela
 * `/hub/[id]` mostra. Jogo não sincronizado ou banco fora do ar → 200 com
 * `found: false` e listas vazias, para a Pré-Live não quebrar e exibir
 * "dados indisponíveis" em vez de inventar número.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await hubInsightsPorEspnId(id);

  return NextResponse.json({
    found: r.labInsights.length > 0 || r.xgFactors.length > 0,
    fixtureId: r.fixtureId,
    analise: r.analise,
    xg: r.xg,
    labInsights: r.labInsights,
    xgFactors: r.xgFactors,
    relatorio: r.relatorio,
  });
}
