import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { consumirQuota, lerQuota, partidasContadasHoje } from "@/lib/quotaServer";

export const dynamic = "force-dynamic";

/**
 * GET /api/quota — estado da cota de hoje (LEITURA apenas).
 *
 * Devolve também `partidasHoje`: as partidas que já gastaram a análise do dia.
 * A UI usa essa lista para não bloquear a reabertura de uma análise já paga —
 * é o servidor dizendo, não o `localStorage`.
 */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ logado: false, quota: null }, { status: 200 });
  const quota = await lerQuota(user);
  const partidasHoje = await partidasContadasHoje(user.id);
  return NextResponse.json({ logado: true, quota, partidasHoje });
}

/**
 * POST /api/quota — consumo manual (compatibilidade).
 *
 * QUEM DEBITA A ANÁLISE É A ROTA DE ANÁLISE (`/api/matches/[id]/analysis`), não
 * o cliente. Este POST continua no ar para não quebrar chamadas antigas, mas o
 * front não o usa mais: um contador acionado pelo browser era o furo — limpar o
 * `localStorage` zerava o bloqueio e liberava análises ilimitadas.
 */
export async function POST() {
  const user = await getUser();
  if (!user) return NextResponse.json({ logado: false, liberado: false, quota: null }, { status: 200 });
  const { liberado, estado } = await consumirQuota(user);
  return NextResponse.json({ logado: true, liberado, quota: estado }, { status: 200 });
}
