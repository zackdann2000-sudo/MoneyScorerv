/**
 * Lista de jogos do resumo (aba "Jogos").
 *
 * GET /api/apitou/jogos?date=YYYY-MM-DD
 *
 * Devolve o resumo enxuto de cada jogo — SEM as props calculadas. A tela de
 * lista não precisa delas, e mandar 548 props por jogo seria desperdício.
 */
import { NextRequest, NextResponse } from "next/server";
import { garantirResumo } from "@/lib/apitou/store";

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

  try {
    const { dados, stale } = await garantirResumo();
    if (!dados) {
      return NextResponse.json(
        { error: "sem dados sincronizados; rode POST /api/apitou/sync" },
        { status: 503 },
      );
    }

    let jogos = dados.jogos;
    if (date) jogos = jogos.filter((j) => diaLocal(j.kickoff) === date);

    return NextResponse.json({
      geradoEm: dados.geradoEm,
      fonte: dados.fonte,
      stale,
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
