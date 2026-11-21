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
 *
 * M3: a agregação deixou de rodar por request. O sync grava
 * `desajustes:<dia>` e `desajustes:semana` já calculados e ordenados; esta rota
 * lê UMA linha e só aplica os filtros do request (`nivel`, `principais`,
 * `limit`), que são baratos em memória. A chave muda com a versão do sync, então
 * não existe cache velho — e `cached: true` na segunda chamada.
 */
import { NextRequest, NextResponse } from "next/server";
import { garantirDesajustes, metaResumo } from "@/lib/apitou/store";
import { ESCOPO_SEMANA, contarPorNivel, diaSaoPaulo, filtrarDesajustes } from "@/lib/apitou/particoes";
import { isMainLeague } from "@/lib/mainLeagues";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const nivel = sp.get("nivel"); // quente | bom | neutro
  const date = sp.get("date");
  const limit = Math.min(Math.max(Number(sp.get("limit") ?? 50), 1), 300);
  const principais = sp.get("principais") === "1";

  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date inválido, use YYYY-MM-DD" }, { status: 400 });
  }

  // Limite por IP: a agregação devolve centenas de props.
  const limite = await rateLimit("apitou:ip", clientIp(req), { limit: 120, windowSec: 300 });
  if (!limite.ok) {
    return NextResponse.json(
      { error: "Muitas requisições. Tente novamente em instantes." },
      { status: 429, headers: { "Retry-After": String(limite.retryAfterSec) } },
    );
  }

  try {
    const escopo = date ?? ESCOPO_SEMANA;
    const r = await garantirDesajustes(escopo);
    if (!r.meta) {
      return NextResponse.json(
        { error: "sem dados sincronizados; rode POST /api/apitou/sync" },
        { status: 503 },
      );
    }

    let itens = filtrarDesajustes(r.itens, { nivel });
    // Antes do slice: ver docblock do arquivo.
    if (principais) itens = itens.filter((d) => isMainLeague(d.competicao));

    const contagem = contarPorNivel(itens);

    return NextResponse.json({
      ...metaResumo(r.meta),
      stale: r.stale,
      revalidando: r.revalidando,
      /** true = veio do `semana-v2` porque a partição do escopo não existia. */
      legado: r.legado,
      /**
       * true = a lista veio pronta do cache de agregação (nada foi recalculado
       * neste request). Falso só no caminho de fallback.
       */
      cached: !r.legado,
      escopo,
      total: itens.length,
      contagem,
      desajustes: itens.slice(0, limit).map((d) => ({
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
        dia: diaSaoPaulo(d.kickoff),
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro desconhecido";
    console.error("[apitou/desajustes]", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
