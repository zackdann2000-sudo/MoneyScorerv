/**
 * Análise de um jogo (aba "Jogo").
 *
 * GET /api/apitou/jogo/[id]
 *
 * Jogo + props calculadas (Poisson/QI/valor) + desajustes + escalações + H2H +
 * estatísticas de time. É a rota que a tela de detalhe usa.
 *
 * M3: lê a partição `jogo:<id>` (~30 KB) com as props JÁ calculadas no sync.
 * Antes, cada requisição carregava a semana inteira e rodava `calcularJogo` —
 * o caminho mais caro do módulo. O filtro por `mercado`/`minValor` continua
 * sendo aplicado aqui (é opinião do request, não dado a cachear).
 */
import { NextRequest, NextResponse } from "next/server";
import { garantirJogo, metaResumo } from "@/lib/apitou/store";
import type { DesajusteCalculado, PropCalculada } from "@/lib/apitou/analise";
import { rateLimit, clientIp } from "@/lib/rateLimit";

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

  // O limite evita que uma aba aberta em loop consuma CPU de function.
  const limite = await rateLimit("apitou:ip", clientIp(req), { limit: 120, windowSec: 300 });
  if (!limite.ok) {
    return NextResponse.json(
      { error: "Muitas requisições. Tente novamente em instantes." },
      { status: 429, headers: { "Retry-After": String(limite.retryAfterSec) } },
    );
  }

  try {
    const r = await garantirJogo(fixtureId);
    if (!r.jogo) {
      return NextResponse.json(
        r.meta
          ? { error: "jogo não encontrado" }
          : { error: "sem dados sincronizados; rode POST /api/apitou/sync" },
        { status: r.meta ? 404 : 503 },
      );
    }

    let props: PropCalculada[] = r.props;
    if (mercado) props = props.filter((p) => p.mercado === mercado);
    if (minValor > 0) props = props.filter((p) => p.valor >= minValor);

    // Ordena por valor, depois QI — o que o usuário quer ver primeiro.
    props = [...props].sort((a, b) => b.valor - a.valor || b.qi - a.qi);

    const desajustes = r.desajustes;

    // Agrupa por mercado para a UI montar as abas de filtro.
    const mercadosDisponiveis = [...new Set(r.props.map((p) => p.mercadoRotulo))].sort();

    const jogo = r.jogo;
    return NextResponse.json({
      ...(r.meta ? metaResumo(r.meta) : { geradoEm: null, atualizadoEm: null, idadeMin: null }),
      stale: r.stale,
      revalidando: r.revalidando,
      /** true = cálculo caiu no fallback da semana (partição ausente). */
      legado: r.legado,
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
        props: r.props.length,
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
    // fixtureId/home/away: necessários para o bilhete de combinada e para o
    // card compartilhável identificarem o jogo sem depender do contexto da tela.
    fixtureId: p.fixtureId,
    home: p.home,
    away: p.away,
    competicao: p.competicao,
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

function resumoDesajustes(desajustes: DesajusteCalculado[]) {
  return desajustes.slice(0, 100).map((d) => {
    const { chave, fixtureId, mercado, linha, odd, probModelo, probMercado, edge, qi, valor, nivel, jogador, home, away } = d;
    return {
      chave,
      fixtureId,
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