/**
 * Lista de jogos do resumo (aba "Jogos").
 *
 * GET /api/apitou/jogos?date=YYYY-MM-DD
 *
 * Devolve o resumo enxuto de cada jogo — SEM as props calculadas. A tela de
 * lista não precisa delas, e mandar 548 props por jogo seria desperdício.
 *
 * M3: esta rota lê a partição `dia:<data>` (~5 KB). Com `?date` é UMA linha; sem
 * data, as `dia:*` da semana numa query só. Antes ela carregava e parseava a
 * semana inteira (~1,2 MB) para mostrar 14 jogos.
 */
import { NextRequest, NextResponse } from "next/server";
import { garantirDias, metaResumo } from "@/lib/apitou/store";
import { diaSaoPaulo } from "@/lib/apitou/particoes";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * Data local (America/Sao_Paulo) em YYYY-MM-DD.
 *
 * A implementação mora em `particoes.ts` (`diaSaoPaulo`): é a mesma usada para
 * particionar o cache. Duas versões disso já foram a origem de jogo aparecer no
 * dia errado — agora existe uma só.
 */
const diaLocal = diaSaoPaulo;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const date = sp.get("date");
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date inválido, use YYYY-MM-DD" }, { status: 400 });
  }

  // Limite por IP: a rota é pública e serve a lista de jogos de um dia.
  const limite = await rateLimit("apitou:ip", clientIp(req), { limit: 120, windowSec: 300 });
  if (!limite.ok) {
    return NextResponse.json(
      { error: "Muitas requisições. Tente novamente em instantes." },
      { status: 429, headers: { "Retry-After": String(limite.retryAfterSec) } },
    );
  }

  try {
    const r = await garantirDias(date);
    if (!r.meta && r.jogos.length === 0) {
      return NextResponse.json(
        { error: "sem dados sincronizados; rode POST /api/apitou/sync" },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ...(r.meta ? metaResumo(r.meta) : { geradoEm: null, atualizadoEm: null, idadeMin: null }),
      fonte: r.fonte,
      stale: r.stale,
      revalidando: r.revalidando,
      /** true = veio do `semana-v2` porque a partição do dia não existia. */
      legado: r.legado,
      total: r.jogos.length,
      // Contagem de dias disponíveis ajuda a UI a mostrar o seletor de data.
      dias: r.dias,
      jogos: r.jogos.map((j) => ({ ...j, dia: j.dia || diaLocal(j.kickoff) })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro desconhecido";
    console.error("[apitou/jogos]", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
