/**
 * GET /api/matches/[id]/tendencias
 *
 * Motor "bateu X de Y nos últimos N jogos" + painel Quentes do confronto.
 *
 * Custo de cota: ZERO quando o cache de 12h está fresco (caso normal). Só a
 * primeira visita a um time paga as ~11 chamadas de `getTeamHistory`. É por
 * isso que este endpoint NUNCA é chamado em lote — quem dispara é a tela, uma
 * partida por vez.
 *
 * Parâmetros:
 *   amostra  5 | 10 (default) | 15   → janela lida
 *   periodo  total (default) | 1t | 2t
 *   lado     casa | fora | todos (default)
 *   limiar   % mínimo para marcar `destaque` (default 60, igual ao screener)
 *
 * Regra de ouro: amostra < 3 ⇒ o mercado NÃO aparece. A rota devolve a lista
 * filtrada, e a UI só precisa renderizar o que veio.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSummaryRaw, matchFromSummary } from "@/lib/espn";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import {
  AMOSTRA_MAX,
  AMOSTRA_PADRAO,
  gerarQuentes,
  gerarTendencias,
  MIN_AMOSTRA,
  type Periodo,
  type Tendencia,
} from "@/lib/tendencias";
import { amostraDe, historicoDoConfronto, metaAmostra } from "@/lib/tendenciasFonte";

export const dynamic = "force-dynamic";

/** Amostras aceitas. Qualquer outro número cai em 10. */
const AMOSTRAS = [5, 10, 15];

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sp = req.nextUrl.searchParams;

  const league = sp.get("league") || "bra.1";
  const amostraBruta = Number(sp.get("amostra"));
  const amostra = AMOSTRAS.includes(amostraBruta) ? amostraBruta : AMOSTRA_PADRAO;
  const periodo: Periodo = sp.get("periodo") === "1t" ? "1t" : sp.get("periodo") === "2t" ? "2t" : "total";
  const lado = sp.get("lado") === "casa" ? "casa" : sp.get("lado") === "fora" ? "fora" : "todos";
  const limiarBruto = Number(sp.get("limiar"));
  const limiar = Number.isFinite(limiarBruto) && limiarBruto > 0 ? limiarBruto : 60;

  const gate = await rateLimit("tendencias-jogo", clientIp(req), { limit: 60, windowSec: 300 });
  if (!gate.ok) {
    return NextResponse.json({ error: "Muitas consultas. Aguarde um instante." }, { status: 429 });
  }

  try {
    const sm = await getSummaryRaw(league, id, "in");
    if (!sm?.header) {
      return NextResponse.json({ error: "Partida não encontrada nesta liga." }, { status: 404 });
    }
    const m = matchFromSummary(sm, league, id);

    const hist = await historicoDoConfronto(league, m.home, m.away, amostra);
    const casa = amostraDe(hist.casa);
    const fora = amostraDe(hist.fora);

    let tendencias = gerarTendencias(casa, fora, { amostra, periodo });
    if (lado !== "todos") {
      /* Métrica de jogo (`lado === null`) vale para os dois: manter. */
      tendencias = tendencias.filter((t) => t.lado === null || t.lado === lado);
    }
    /* O limiar não esconde nada — só marca o que passou. Esconder mercado com
       amostra válida seria esconder informação do assinante. */
    const marcadas: (Tendencia & { destaque: boolean })[] = tendencias.map((t) => ({
      ...t,
      destaque: t.pct >= limiar,
    }));

    const cem = marcadas.filter((t) => t.cemPorCento).length;
    const casaN = hist.casa.jogos.length;
    const foraN = hist.fora.jogos.length;

    return NextResponse.json({
      match: {
        id: m.id,
        league: m.league,
        leagueName: m.leagueName,
        home: m.home,
        away: m.away,
        date: m.date,
        state: m.state,
      },
      params: { amostra, periodo, lado, limiar },
      tendencias: marcadas,
      resumo: {
        total: marcadas.length,
        cemPorCento: cem,
        /** Quantos jogos sustentam de fato cada lado — o número que exibimos. */
        casaJogos: casaN,
        foraJogos: foraN,
        /** true quando algum lado não chegou à amostra pedida. */
        baseParcial: casaN < amostra || foraN < amostra,
        /** Só há o que mostrar se cada lado tem o mínimo. */
        suficiente: casaN >= MIN_AMOSTRA && foraN >= MIN_AMOSTRA,
        maxAmostra: AMOSTRA_MAX,
      },
      quentes: {
        casa: gerarQuentes(casa, amostra),
        fora: gerarQuentes(fora, amostra),
      },
      fontes: {
        casa: metaAmostra(hist.casa),
        fora: metaAmostra(hist.fora),
      },
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
