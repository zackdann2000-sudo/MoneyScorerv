/**
 * GET /api/referees — tabela de árbitros do módulo ÁRBITROS (feature #5).
 *
 *   ?q=daronco        busca por nome (sem acento, sem caixa)
 *   ?so=1             só quem tem jogo futuro apitado
 *   ?ordem=cartoes    cartoes|amarelos|vermelhos|faltas|penaltis|jogos|nome
 *   ?dir=asc
 *   ?min=5            esconde base menor que N jogos
 *   ?liga=serie       filtra pela liga do PRÓXIMO jogo
 *
 * O cálculo é todo local (banco + cache do feed do apitou): nenhuma API paga
 * é chamada aqui. `origem` diz de onde veio o dado e existe para a tela poder
 * ser honesta sobre a amostra.
 */
import { NextRequest, NextResponse } from "next/server";
import { agregar, filtrarArbitros, resumoLista, type OrdemArbitro } from "@/lib/arbitros";
import { coletar } from "@/lib/arbitrosFonte";

export const dynamic = "force-dynamic";

const ORDENS: OrdemArbitro[] = ["cartoes", "amarelos", "vermelhos", "faltas", "penaltis", "jogos", "nome"];

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  try {
    const dados = await coletar();
    const lista = agregar(dados.snapshots, dados.aparicoes, Date.now());

    const ordemParam = String(sp.get("ordem") ?? "cartoes") as OrdemArbitro;
    const arbitros = filtrarArbitros(lista, {
      q: sp.get("q") ?? undefined,
      soComProximoJogo: sp.get("so") === "1",
      ordem: ORDENS.includes(ordemParam) ? ordemParam : "cartoes",
      dir: sp.get("dir") === "asc" ? "asc" : "desc",
      minJogos: Number(sp.get("min") ?? 0) || undefined,
      liga: sp.get("liga") ?? undefined,
    });

    return NextResponse.json(
      {
        arbitros,
        resumo: resumoLista(arbitros),
        origem: dados.origem,
        idadeFeedSegundos:
          dados.idadeFeedMs == null ? null : Math.round(Math.max(0, dados.idadeFeedMs) / 1000),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: "falha ao montar a tabela de árbitros", detalhe: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
