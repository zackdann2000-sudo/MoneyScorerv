import { NextRequest, NextResponse } from "next/server";
import { getSummaryRaw, matchFromSummary } from "@/lib/espn";
import { getOracleData } from "@/lib/engine";
import { headersAoVivo } from "@/lib/cache";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const league = req.nextUrl.searchParams.get("league") || "bra.1";

  /* ACESSO: o Oracle entrega xG real e o veredito de pressão — conteúdo do
     produto. Mesma regra de `/props` (conta ativa/admin). O `error` no corpo do
     402/403 é renderizado como texto em `InfoTabs` (`oracle.error ? ...`), então
     o bloco explica o bloqueio em vez de sumir sem explicação. */
  const user = await getUser().catch(() => null);
  if (!user || !(user.isAdmin || user.access.active)) {
    return NextResponse.json(
      { locked: true, error: "Conteúdo VIP. Entre com uma conta ativa para ver o Oracle (xG) do jogo." },
      { status: user ? 402 : 403 },
    );
  }
  try {
    const sm = await getSummaryRaw(league, id, "in");
    const match = matchFromSummary(sm, league, id);
    const data = await getOracleData(match);
    /* Ao vivo → no-store: o placar/xG do Oracle não pode ficar mais velho que o
       snapshot de 30 s da ESPN, senão o card contradiz o topo da tela. */
    return NextResponse.json(data, { headers: headersAoVivo(match.live) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Oracle indisponível." }, { status: 502 });
  }
}