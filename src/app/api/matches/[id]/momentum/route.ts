import { NextRequest, NextResponse } from "next/server";
import { getSummaryRaw, matchFromSummary } from "@/lib/espn";
import { headersAoVivo } from "@/lib/cache";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { extrairLances, minutoDoRelogio, pressao, seriePressao, sinalPressao, appm, JANELA_GRAFICO, JANELA_SINAL } from "@/lib/momentum";
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
    /* A partida ao vivo nunca é cacheada pelo cliente/CDN: o único cache no
       caminho é o snapshot da ESPN, de 30 s (getSummaryRaw state="in"). */
    const headers = headersAoVivo(m.live);
    const lances = extrairLances(sm?.commentary || [], m.home, m.away);
    if (!lances.length) {
      return NextResponse.json({
        ok: true,
        vazio: true,
        minuto: minutoDoRelogio(m.clock) ?? 0,
        pressao: null,
        sinal: { nivel: null, lado: null, pct: null, rotulo: "" },
        serie: [],
        appm: null,
        prob: null,
        fonte: "ESPN",
      }, { headers });
    }

    /*
     * Minuto do cálculo = RELÓGIO da partida, não o último lance narrado.
     *
     * A narração da ESPN chega com atraso: com o cronômetro em 26' o último
     * lance podia ser dos 19', e aí o card de probabilidade e o gráfico de
     * momentum ficavam parados em 19' enquanto o placar no topo marcava 26'.
     * Ordem de confiança: minuto que o cliente já mostra (`?minuto=`, derivado
     * do estado global) → relógio do resumo → último lance (fallback).
     */
    const minutoLances = lances.reduce((mx, l) => Math.max(mx, l.minuto), 0);
    const pedido = Number(req.nextUrl.searchParams.get("minuto"));
    const minutoCliente = Number.isFinite(pedido) && pedido > 0 ? Math.min(120, Math.floor(pedido)) : 0;
    const minutoRelogio = m.live ? (minutoDoRelogio(m.clock) ?? 0) : 0;
    const minutoAtual = Math.max(minutoLances, minutoRelogio, minutoCliente);

    const p15 = pressao(lances, { minuto: minutoAtual, janela: JANELA_GRAFICO });
    const p10 = pressao(lances, { minuto: minutoAtual, janela: JANELA_SINAL });

    /* Placar oficial do cabeçalho: a narração pode não ter o gol mais recente. */
    const placar =
      typeof m.home.score === "number" && typeof m.away.score === "number"
        ? { casa: m.home.score, fora: m.away.score }
        : undefined;

    // Probabilidade 1X2 ao vivo: mesma narração, nenhuma chamada extra à ESPN.
    const probAtual = calcularWinProb(lances, { minuto: minutoAtual, janela: JANELA_GRAFICO, placar });
    const prob = probAtual
      ? {
          atual: probAtual,
          serie: serieWinProb(lances, { minuto: minutoAtual, janela: JANELA_GRAFICO, passo: 5, placar }),
        }
      : null;

    return NextResponse.json({
      ok: true,
      vazio: false,
      minuto: minutoAtual,
      pressao: p15,
      sinal: sinalPressao(p10),
      serie: seriePressao(lances, { minuto: minutoAtual, janela: JANELA_GRAFICO, passo: 3 }),
      // APPM: ataques perigosos por minuto (1, 3, 5, 10 e jogo todo) — mesma narração.
      appm: appm(lances, { minuto: minutoAtual }),
      prob,
      fonte: "ESPN",
    }, { headers });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha no momentum." }, { status: 502 });
  }
}
