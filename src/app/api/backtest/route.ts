import { NextRequest, NextResponse } from "next/server";
import { picksParaBacktest } from "@/lib/trackRecord";
import { opcoesDoLedger, rodarBacktest } from "@/lib/backtest";

export const dynamic = "force-dynamic";

/**
 * GET → backtest do ledger para a tela `/validador`.
 *
 * Query:
 *   liga    nome exato da liga ou "all" (padrão)
 *   mercado chave do mercado (`over25`, `btts`, ...) ou "all" (padrão)
 *   linha   linha exata, quando o mercado tem linha
 *   dias    janela em dias contada do dia do JOGO (vazio = tudo)
 *   banca   banca inicial em unidades (padrão 100)
 *   unidade stake fixa por pick em unidades (padrão 1)
 *
 * Devolve `backtest` (matemática em `lib/backtest.ts`, puro e testado) e
 * `opcoes` (ligas/mercados com contagem, montadas do próprio ledger — o seletor
 * nunca oferece um recorte que não existe).
 *
 * Stake é FIXA de propósito: aqui se mede o modelo, não a gestão de banca.
 * Composto transforma amostra pequena em curva bonita.
 */
function numero(valor: string | null): number | null {
  if (valor == null || valor === "") return null;
  const n = Number(String(valor).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  try {
    const rows = await picksParaBacktest();
    const opcoes = opcoesDoLedger(rows);
    const dias = numero(sp.get("dias"));
    const backtest = rodarBacktest(
      rows,
      {
        liga: sp.get("liga") || "all",
        mercado: sp.get("mercado") || "all",
        linha: numero(sp.get("linha")),
        dias: dias != null && dias > 0 ? dias : null,
      },
      {
        bancaInicial: numero(sp.get("banca")) ?? 100,
        unidade: numero(sp.get("unidade")) ?? 1,
      },
    );
    return NextResponse.json({ backtest, opcoes });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Falha no backtest.", backtest: null, opcoes: { ligas: [], mercados: [], liquidadas: 0 } },
      { status: 500 },
    );
  }
}
