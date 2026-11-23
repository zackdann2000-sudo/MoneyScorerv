import { NextRequest, NextResponse } from "next/server";
import { getSummaryRaw, matchFromSummary, getTeamHistory } from "@/lib/espn";
import { filtrarMelhores, mercadosDoJogo } from "@/lib/mercadosPoisson";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * GET /api/matches/[id]/markets?league=bra.1&home=<teamId>&away=<teamId>
 *
 * Mercados específicos (BTTS, 0.5+ gols do 1º tempo por time, 1.5+ gols do jogo
 * e de cada time, 4.5+ escanteios do 1º tempo e 8.5+ escanteios do jogo) com
 * probabilidade Poisson calculada sobre os últimos 10 jogos reais dos dois
 * times (ESPN). Sem 10 jogos na fonte, o mercado sai como "sem dados".
 *
 * Os ids dos times vêm por query (a tela de jogo já os tem). Se faltarem, a
 * rota resolve pelo summary do evento — uma chamada extra, nunca um número
 * inventado.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sp = req.nextUrl.searchParams;
  const league = sp.get("league") || "bra.1";
  let home = String(sp.get("home") || "").trim();
  let away = String(sp.get("away") || "").trim();

  try {
    if (!home || !away) {
      const sm = await getSummaryRaw(league, id, "in");
      const match = sm ? matchFromSummary(sm, league, id) : null;
      home = home || match?.home?.id || "";
      away = away || match?.away?.id || "";
    }
    if (!home || !away) {
      return NextResponse.json(
        { error: "Não foi possível identificar os dois times desta partida." },
        { status: 400 },
      );
    }

    const [casa, fora] = await Promise.all([
      getTeamHistory(league, home, 10).catch(() => null),
      getTeamHistory(league, away, 10).catch(() => null),
    ]);
    if (!casa || !fora) {
      return NextResponse.json(
        { error: "Histórico recente indisponível na fonte para estes times." },
        { status: 502 },
      );
    }

    const mercados = mercadosDoJogo(casa.games, fora.games);
    const melhores = filtrarMelhores(mercados);

    return NextResponse.json({
      mercados,
      melhores,
      amostra: { casa: casa.games.length, fora: fora.games.length },
      fonte: "ESPN",
      updatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Falha ao calcular os mercados." },
      { status: 502 },
    );
  }
}
