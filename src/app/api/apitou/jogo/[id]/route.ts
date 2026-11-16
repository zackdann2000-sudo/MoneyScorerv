/**
 * Análise de um jogo (aba "Jogo").
 *
 * GET /api/apitou/jogo/[id]
 *
 * Jogo + props calculadas (Poisson/QI/valor) + desajustes + escalações + H2H +
 * estatísticas de time. É a rota que a tela de detalhe usa.
 */
import { NextRequest, NextResponse } from "next/server";
import { garantirResumo } from "@/lib/apitou/store";
import { calcularJogo, extrairDesajustes, type PropCalculada } from "@/lib/apitou/analise";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const fixtureId = Number(id);
  if (!Number.isInteger(fixtureId) || fixtureId <= 0) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const mercado = req.nextUrl.searchParams.get("mercado") ?? "";
  const minValor = Number(req.nextUrl.searchParams.get("minValor") ?? 0);

  try {
    const { dados, stale } = await garantirResumo();
    if (!dados) {
      return NextResponse.json(
        { error: "sem dados sincronizados; rode POST /api/apitou/sync" },
        { status: 503 },
      );
    }

    const jogo = dados.jogos.find((j) => j.id === fixtureId);
    if (!jogo) {
      return NextResponse.json({ error: "jogo não encontrado" }, { status: 404 });
    }

    const todas = calcularJogo(jogo);
    let props = todas;
    if (mercado) props = props.filter((p) => p.mercado === mercado);
    if (minValor > 0) props = props.filter((p) => p.valor >= minValor);

    // Ordena por valor, depois QI — o que o usuário quer ver primeiro.
    props.sort((a, b) => b.valor - a.valor || b.qi - a.qi);

    const desajustes = extrairDesajustes(todas);

    // Agrupa por mercado para a UI montar as abas de filtro.
    const mercadosDisponiveis = [...new Set(todas.map((p) => p.mercadoRotulo))].sort();

    return NextResponse.json({
      geradoEm: dados.geradoEm,
      stale,
      jogo: {
        id: jogo.id,
        competicao: jogo.competicao,
        home: jogo.home,
        away: jogo.away,
        kickoff: jogo.kickoff,
        arbitro: jogo.arbitro,
        escHome: jogo.escHome,
        escAway: jogo.escAway,
        statsHome: jogo.statsHome,
        statsAway: jogo.statsAway,
        h2hResumo: jogo.h2hResumo,
        mercados: jogo.mercados,
        jogadores: jogo.jogadores.map((pj) => ({
          nome: pj.nome,
          pos: pj.pos,
          time: pj.time,
        })),
      },
      mercadosDisponiveis,
      props: resumoProps(props),
      desajustes: resumoDesajustes(desajustes),
      totais: {
        props: todas.length,
        desajustes: desajustes.length,
        quentes: desajustes.filter((d) => d.nivel === "quente").length,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro desconhecido";
    console.error("[apitou/jogo]", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

/** Corta campos pesados que a UI não usa por prop. */
function resumoProps(props: PropCalculada[]) {
  return props.map((p) => ({
    chave: p.chave,
    mercado: p.mercado,
    mercadoRotulo: p.mercadoRotulo,
    jogador: p.jogador,
    time: p.time,
    pos: p.pos,
    linha: p.linha,
    odd: p.odd,
    probModelo: Math.round(p.probModelo * 1000) / 1000,
    edge: Math.round(p.edge * 1000) / 1000,
    qi: p.qi,
    valor: p.valor,
    confianca: p.confianca,
    mediaBase: Math.round(p.mediaBase * 100) / 100,
    amostra: p.amostra,
  }));
}

function resumoDesajustes(desajustes: ReturnType<typeof extrairDesajustes>) {
  return desajustes.slice(0, 100).map((d) => {
    const { chave, mercado, linha, odd, probModelo, probMercado, edge, qi, valor, nivel, jogador, home, away } = d;
    return {
      chave,
      mercado,
      linha,
      odd,
      probModelo,
      // Probabilidade implícita na odd: é o que a UI mostra ao lado do modelo.
      probMercado: Math.round(probMercado * 1000) / 1000,
      edge,
      qi,
      valor,
      nivel,
      jogador,
      home,
      away,
    };
  });
}