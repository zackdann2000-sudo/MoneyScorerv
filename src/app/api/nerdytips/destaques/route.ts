/**
 * Bet of the Day + Slip do dia.
 *
 * GET /api/nerdytips/destaques
 *
 * Duas páginas, por um motivo concreto: o `/bet-of-the-day` é o único lugar que
 * traz os contadores (bankers, próximos, acerto) e o slip pronto, mas entrega os
 * palpites do board **travados** ("•••", inclusive a odd) para quem não assina.
 * Os boards públicos (`/` e `/all-matches`) têm os mesmos jogos com palpite, odd
 * e confiança. Então buscamos os dois e juntamos por id em `mesclarDestaques`.
 *
 * O board usa a MESMA chave de cache da aba Palpites (`v2:palpites:todas`):
 * quem abre as duas abas não paga o download duas vezes.
 */
import { NextResponse } from "next/server";
import { mesclarDestaques, parseBoard, parseDestaques } from "@/lib/nerdytips/fonte";
import { CACHE_TTL_MS, comCache } from "@/lib/nerdytips/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const [destaques, board] = await Promise.all([
      comCache("v3:destaques", "/bet-of-the-day", parseDestaques),
      comCache("v2:palpites:todas", "/all-matches", parseBoard),
    ]);

    const dados = mesclarDestaques(destaques.dados, board.dados);
    // O selo de cache segue a idade do bet-of-the-day; o board só completa dados.
    const idadeMs = Math.max(destaques.idadeMs, board.idadeMs);

    return NextResponse.json({
      ...dados,
      cache: {
        source: destaques.cache,
        ageSeconds: Math.round(idadeMs / 1000),
        ttlSeconds: CACHE_TTL_MS / 1000,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "falha ao buscar destaques", jogos: [], ligas: [] },
      { status: 502 },
    );
  }
}
