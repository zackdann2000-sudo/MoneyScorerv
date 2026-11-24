import { NextRequest, NextResponse } from "next/server";
import { getSummaryRaw, matchFromSummary } from "@/lib/espn";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { extrairLances, pressao, seriePressao, sinalPressao, JANELA_GRAFICO, JANELA_SINAL } from "@/lib/momentum";
import { calcularWinProb, serieWinProb } from "@/lib/winProb";

export const dynamic = "force-dynamic";

/**
 * Momentum ao vivo: lê a narração da ESPN (já em cache) e devolve a pressão dos
 * últimos 15 min + o selo FIRE/BALL dos últimos 10.
 *
 * Só ESPN — nunca gasta cota da API-Football. Público, com rate limit.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const league = req.nextUrl.searchParams.get("league") || "bra.1";

  // auth → rate limit → trabalho (anônimo nunca consome CPU à toa)
  //
  // 240/h = 4 req/min: o cliente busca a cada 30 s (120/h) e duas abas abertas
  // ainda cabem. Com 60/h o gráfico congelava em silêncio depois de ~30 min de
  // jogo — o polling estourava o teto e todo request virava 429.
  const ip = clientIp(req);
  const rl = await rateLimit("momentum", ip, { limit: 240, windowSec: 60 * 60 });
  if (!rl.ok) {
    return NextResponse.json({ error: "Muitas requisições." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 60) } });
  }

  try {
    const sm = await getSummaryRaw(league, id, "in").catch(() => null);
    if (!sm) return NextResponse.json({ error: "Sem resumo da ESPN." }, { status: 502 });

    const m = matchFromSummary(sm, league, id);
    const lances = extrairLances(sm?.commentary || [], m.home, m.away);
    if (!lances.length) {
      return NextResponse.json({
        ok: true,
        vazio: true,
        minuto: 0,
        pressao: null,
        sinal: { nivel: null, lado: null, pct: null, rotulo: "" },
        serie: [],
        prob: null,
        fonte: "ESPN",
      });
    }

    const minutoAtual = lances.reduce((mx, l) => Math.max(mx, l.minuto), 0);
    const p15 = pressao(lances, { minuto: minutoAtual, janela: JANELA_GRAFICO });
    const p10 = pressao(lances, { minuto: minutoAtual, janela: JANELA_SINAL });

    // Probabilidade 1X2 ao vivo: mesma narração, nenhuma chamada extra à ESPN.
    const probAtual = calcularWinProb(lances, { minuto: minutoAtual, janela: JANELA_GRAFICO });
    const prob = probAtual
      ? { atual: probAtual, serie: serieWinProb(lances, { minuto: minutoAtual, janela: JANELA_GRAFICO, passo: 5 }) }
      : null;

    return NextResponse.json({
      ok: true,
      vazio: false,
      minuto: minutoAtual,
      pressao: p15,
      sinal: sinalPressao(p10),
      serie: seriePressao(lances, { minuto: minutoAtual, janela: JANELA_GRAFICO, passo: 3 }),
      prob,
      fonte: "ESPN",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha no momentum." }, { status: 502 });
  }
}
