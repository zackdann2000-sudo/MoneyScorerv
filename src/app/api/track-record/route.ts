import { NextRequest, NextResponse } from "next/server";
import { settleAndReport } from "@/lib/engine";
import { auditPicks } from "@/lib/credibility";
import { faixasDeOdd, competenciaPorLigaMercado } from "@/lib/trackRecord";

export const dynamic = "force-dynamic";

/**
 * GET → Track Record da tela `/desempenho`.
 *
 * Devolve quatro blocos independentes:
 *   · `...model`    → KPIs e previsões (engine.ts)
 *   · `audit`       → auditoria das picks publicadas (Money Tips)
 *   · `clv`         → faixas de odd + CLV médio da Pinnacle (value_bet_history)
 *   · `competencia` → acerto, Brier e ROI por liga × mercado (competencia.ts)
 *
 * Os quatro rodam em paralelo e nenhum derruba a rota: se uma tabela ainda não
 * tiver os dados, o bloco volta vazio e a tela mostra o estado explícito
 * ("—" / "Aguardando dados"), nunca um número inventado.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  try {
    const [model, audit, clv, competencia] = await Promise.all([
      settleAndReport(),
      auditPicks({ period: sp.get("period") || "30", league: sp.get("league") || "all", market: sp.get("market") || "all" }),
      faixasDeOdd(),
      competenciaPorLigaMercado(),
    ]);
    return NextResponse.json({ ...model, audit, clv, competencia });
  } catch (e: any) {
    return NextResponse.json({
      error: e?.message,
      last30: { total: 0, greens: 0, reds: 0, pending: 0, acc: null },
      recent: [],
      picks: [],
      audit: null,
      clv: null,
      competencia: null,
    });
  }
}
