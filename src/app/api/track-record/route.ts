import { NextRequest, NextResponse } from "next/server";
import { settleAndReport } from "@/lib/engine";
import { auditPicks } from "@/lib/credibility";
import { faixasDeOdd } from "@/lib/trackRecord";

export const dynamic = "force-dynamic";

/**
 * GET → Track Record da tela `/desempenho`.
 *
 * Devolve três blocos independentes:
 *   · `...model`  → KPIs e previsões (engine.ts)
 *   · `audit`     → auditoria das picks publicadas (Money Tips)
 *   · `clv`       → faixas de odd + CLV médio da Pinnacle (value_bet_history)
 *
 * `clv` roda em paralelo e nunca derruba a rota: se a tabela ainda não tiver as
 * colunas de CLV, `faixasDeOdd` devolve o resumo vazio e a tela mostra "—".
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  try {
    const [model, audit, clv] = await Promise.all([
      settleAndReport(),
      auditPicks({ period: sp.get("period") || "30", league: sp.get("league") || "all", market: sp.get("market") || "all" }),
      faixasDeOdd(),
    ]);
    return NextResponse.json({ ...model, audit, clv });
  } catch (e: any) {
    return NextResponse.json({
      error: e?.message,
      last30: { total: 0, greens: 0, reds: 0, pending: 0, acc: null },
      recent: [],
      picks: [],
      audit: null,
      clv: null,
    });
  }
}
