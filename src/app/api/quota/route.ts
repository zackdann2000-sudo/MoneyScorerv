import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { consumirQuota, lerQuota } from "@/lib/quotaServer";

export const dynamic = "force-dynamic";

/** GET /api/quota — quantas análises o usuário ainda pode abrir hoje. */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ logado: false, quota: null }, { status: 200 });
  const quota = await lerQuota(user);
  return NextResponse.json({ logado: true, quota });
}

/**
 * POST /api/quota — consome 1 análise (chamado ao abrir a partida).
 * Devolve `liberado:false` + estado quando a quota do dia acabou; o cliente
 * então mostra o PaywallCard em vez da análise.
 */
export async function POST() {
  const user = await getUser();
  if (!user) return NextResponse.json({ logado: false, liberado: false, quota: null }, { status: 200 });
  const { liberado, estado } = await consumirQuota(user);
  return NextResponse.json({ logado: true, liberado, quota: estado }, { status: 200 });
}
