/**
 * Bet Builder do NerdyTips — combinada.
 *
 * GET /api/nerdytips/builder
 *
 * O gerador de verdade (`POST /bet-builder/generate`, form-urlencoded com
 * `num_picks_range`, `min_trust`, `target_odds`, `bases`, `slip_size`…) exige
 * assinatura: testamos com cookie de sessão e três combinações de parâmetros e
 * a resposta é sempre `403 {"error":"subscription_required"}`. Não há como
 * raspar o gerador sem pagar.
 *
 * O que a página entrega de graça é o "Free daily slip" já renderizado no HTML
 * (o bloco vem com `hidden` e o JS só o revela ao clicar em "Generate free
 * slip"). É esse slip de 3 picks que expomos aqui — sem inventar picks, sem
 * simular preço e sem dar a entender que temos o builder completo.
 */
import { NextResponse } from "next/server";
import { parseCombinada } from "@/lib/nerdytips/fonte";
import { CACHE_TTL_MS, comCache } from "@/lib/nerdytips/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const r = await comCache("v1:builder", "/bet-builder", parseCombinada);
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
      { error: e instanceof Error ? e.message : "falha ao buscar a combinada", itens: [] },
      { status: 502 },
    );
  }
}
