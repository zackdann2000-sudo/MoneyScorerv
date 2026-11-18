/**
 * Palpites do dia do NerdyTips.
 *
 * GET /api/nerdytips/palpites            -> board da home (só o dia)
 * GET /api/nerdytips/palpites?todas=1    -> /all-matches (lista maior)
 * GET /api/nerdytips/palpites?placar=1   -> /correct-score-predictions-today
 *
 * Devolve o resumo já normalizado (times, odds, picks, confiança, placar), com
 * os mesmos nomes de campo que o resto do projeto usa.
 */
import { NextRequest, NextResponse } from "next/server";
import { parseBoard } from "@/lib/nerdytips/fonte";
import { CACHE_TTL_MS, comCache } from "@/lib/nerdytips/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const todas = req.nextUrl.searchParams.get("todas") === "1";
  const placar = req.nextUrl.searchParams.get("placar") === "1";

  const caminho = placar ? "/correct-score-predictions-today" : todas ? "/all-matches" : "/";
  // v2: o parser passou a normalizar odd (formato americano vindo de IP dos EUA).
  const chave = placar ? "v2:palpites:placar" : todas ? "v2:palpites:todas" : "v2:palpites";

  try {
    const r = await comCache(chave, caminho, parseBoard);
    return NextResponse.json({
      ...r.dados,
      cache: {
        source: r.cache,
        ageSeconds: Math.round(r.idadeMs / 1000),
        ttlSeconds: CACHE_TTL_MS / 1000,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "falha ao buscar palpites", jogos: [], ligas: [] },
      { status: 502 },
    );
  }
}
