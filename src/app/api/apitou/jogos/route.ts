/**
 * Lista de jogos do resumo (aba "Jogos").
 *
 * GET /api/apitou/jogos?date=YYYY-MM-DD
 *
 * Devolve o resumo enxuto de cada jogo — SEM as props calculadas. A tela de
 * lista não precisa delas, e mandar 548 props por jogo seria desperdício.
 */
import { NextRequest, NextResponse } from "next/server";
import { garantirResumo, metaResumo } from "@/lib/apitou/store";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/** Data local (America/Sao_Paulo) em YYYY-MM-DD, para casar com o kickoff. */
function diaLocal(iso: string): string {
  // O site trabalha em UTC-3; usar o fuso de São Paulo evita um jogo de 21h
  // aparecer no dia seguinte.
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const date = sp.get("date");
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date inválido, use YYYY-MM-DD" }, { status: 400 });
  }

  // Limite por IP: a rota é pública e serve um payload de ~14 jogos por chamada.
  const limite = await rateLimit("apitou:ip", clientIp(req), { limit: 120, windowSec: 300 });
  if (!limite.ok) {
    return NextResponse.json(
      { error: "Muitas requisições. Tente novamente em instantes." },
      { status: 429, headers: { "Retry-After": String(limite.retryAfterSec) } },
    );
  }

  try {
    const { dados, stale, revalidando } = await garantirResumo();
    if (!dados) {
      return NextResponse.json(
        { error: "sem dados sincronizados; rode POST /api/apitou/sync" },
        { status: 503 },
      );
    }

    let jogos = dados.jogos;
    if (date) jogos = jogos.filter((j) => diaLocal(j.kickoff) === date);

    return NextResponse.json({
      ...metaResumo(dados),
      fonte: dados.fonte,
      stale,
      revalidando,
      total: jogos.length,
      // Contagem de dias disponíveis ajuda a UI a mostrar o seletor de data.
      dias: [...new Set(dados.jogos.map((j) => diaLocal(j.kickoff)))].sort(),
      jogos: jogos.map((j) => ({
        id: j.id,
        competicao: j.competicao,
        ligaId: j.ligaId,
        home: j.home,
        away: j.away,
        kickoff: j.kickoff,
        dia: diaLocal(j.kickoff),
        jogadores: j.jogadores.length,
        mercados: j.mercados.length,
        temEscalacao: Boolean(j.escHome || j.escAway),
        arbitro: j.arbitro?.nome ?? null,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro desconhecido";
    console.error("[apitou/jogos]", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
