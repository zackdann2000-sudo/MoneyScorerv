import { NextRequest, NextResponse } from "next/server";
import { hubInsightsPorEspnId } from "@/lib/hub/queries";
import { getUser } from "@/lib/auth";

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
 *
 * ACESSO: é conteúdo do produto (padrões, fatores de xG e o relatório IA), então
 * segue a mesma regra de `/props`: só conta ativa/admin. O corpo do 402/403 já
 * vem no formato que a UI sabe desenhar — `relatorio: null` desliga o card em
 * `InfoTabs` (`insights?.relatorio &&`), sem quebrar a aba.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  // 1) Gate VIP: o mesmo de `/api/matches/[id]/props`.
  const user = await getUser().catch(() => null);
  if (!user || !(user.isAdmin || user.access.active)) {
    return NextResponse.json(
      {
        locked: true,
        error: "Conteúdo VIP. Entre com uma conta ativa para ver o relatório e os padrões do jogo.",
        found: false,
        fixtureId: null,
        analise: null,
        xg: null,
        labInsights: [],
        xgFactors: [],
        relatorio: null,
      },
      { status: user ? 402 : 403 },
    );
  }

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
