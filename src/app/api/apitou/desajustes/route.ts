/**
 * Desajustes de toda a semana (aba "Desajustes").
 *
 * GET /api/apitou/desajustes?nivel=quente&date=YYYY-MM-DD&limit=50&principais=1
 *
 * Lista as props em que o modelo vê mais chance do que o mercado paga. É a
 * agregação transversal — a versão por jogo fica em /api/apitou/jogo/[id].
 *
 * `principais=1` filtra só as 16 ligas principais. Isso é feito ANTES do
 * `slice(limit)`: filtrar depois devolveria menos itens que o pedido e a
 * paginação "carregar mais" ficaria furada.
 */
import { NextRequest, NextResponse } from "next/server";
import { garantirResumo } from "@/lib/apitou/store";
import { calcularTodas, extrairDesajustes } from "@/lib/apitou/analise";
import { isMainLeague } from "@/lib/mainLeagues";

export const dynamic = "force-dynamic";

function diaLocal(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const nivel = sp.get("nivel"); // quente | bom | neutro
  const date = sp.get("date");
  const limit = Math.min(Math.max(Number(sp.get("limit") ?? 50), 1), 300);
  const principais = sp.get("principais") === "1";

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

    const props = calcularTodas(jogos);

    // Só submete ao filtro de edge o que já passou do mínimo; evita ordenar
    // centenas de props que seriam descartadas de qualquer forma.
    let desajustes = extrairDesajustes(props, 0.03);
    if (nivel) desajustes = desajustes.filter((d) => d.nivel === nivel);
    // Antes do slice: ver docblock do arquivo.
    if (principais) desajustes = desajustes.filter((d) => isMainLeague(d.competicao));

    const contagem = desajustes.reduce<Record<string, number>>((acc, d) => {
      acc[d.nivel] = (acc[d.nivel] ?? 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      geradoEm: dados.geradoEm,
      stale,
      total: desajustes.length,
      contagem,
      desajustes: desajustes.slice(0, limit).map((d) => ({
        chave: d.chave,
        fixtureId: d.fixtureId,
        competicao: d.competicao,
        mercado: d.mercado,
        linha: d.linha,
        odd: d.odd,
        probModelo: Math.round(d.probModelo * 1000) / 1000,
        probMercado: Math.round(d.probMercado * 1000) / 1000,
        edge: Math.round(d.edge * 1000) / 1000,
        qi: d.qi,
        valor: d.valor,
        nivel: d.nivel,
        jogador: d.jogador,
        home: d.home,
        away: d.away,
        kickoff: d.kickoff,
        dia: diaLocal(d.kickoff),
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro desconhecido";
    console.error("[apitou/desajustes]", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
