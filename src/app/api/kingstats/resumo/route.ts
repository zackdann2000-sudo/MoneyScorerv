import { NextResponse } from "next/server";
import { buscarResumo } from "@/lib/kingstats";
import { ler, gravar } from "@/lib/kingstats/store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CHAVE = "resumo";
const TTL = 10 * 60 * 1000;

/**
 * GET /api/kingstats/resumo
 *
 * Painel de desempenho agregado (unidades, greens/reds, séries diária e mensal,
 * últimos resultados). Cacheado 10 min: é um dado que muda devagar.
 */
export async function GET(req: Request) {
  const revalidate = new URL(req.url).searchParams.get("revalidate") === "1";

  const cache = await ler<unknown>(CHAVE);
  if (cache && !revalidate && cache.idade < TTL) {
    return NextResponse.json({ ...(cache.dados as object), cached: true, idadeMs: cache.idade });
  }

  const resumo = await buscarResumo();
  if (!resumo) {
    if (cache) return NextResponse.json({ ...(cache.dados as object), cached: true, stale: true });
    return NextResponse.json({ error: "fonte indisponível" }, { status: 502 });
  }

  await gravar(CHAVE, "resumo", resumo);
  return NextResponse.json({ ...resumo, cached: false, idadeMs: 0 });
}
