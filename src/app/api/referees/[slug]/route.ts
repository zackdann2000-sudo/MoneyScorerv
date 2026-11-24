/**
 * GET /api/referees/[slug] — dossiê de um árbitro.
 *
 * `slug` é o nome normalizado com hífens ("raphael-claus"); o caminho inverso
 * (`nomeDeSlug`) devolve a chave de agrupamento. Assim não dependemos do id
 * serial do banco (que não existe para quem só apareceu no feed).
 *
 * Devolve:
 *   arbitro      → agregado (médias + base + próximo jogo)
 *   historico    → jogos apitados, mais recente primeiro (limite 40)
 *   distribuicao → quantos jogos em cada faixa de cartões
 */
import { NextRequest, NextResponse } from "next/server";
import { agregar, distribuicaoCartoes, historico, nomeDeSlug } from "@/lib/arbitros";
import { coletar } from "@/lib/arbitrosFonte";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const chave = nomeDeSlug(slug);

  try {
    const dados = await coletar();
    const lista = agregar(dados.snapshots, dados.aparicoes, Date.now());
    const arbitro = lista.find((a) => a.slug === slug) ?? lista.find((a) => a.slug === chave.replace(/\s+/g, "-"));

    if (!arbitro) {
      return NextResponse.json(
        { error: "árbitro não encontrado", slug, origem: dados.origem },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        arbitro,
        historico: historico(dados.aparicoes, slug, 40),
        distribuicao: distribuicaoCartoes(dados.aparicoes, slug),
        origem: dados.origem,
        idadeFeedSegundos:
          dados.idadeFeedMs == null ? null : Math.round(Math.max(0, dados.idadeFeedMs) / 1000),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: "falha ao montar o dossiê", detalhe: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
