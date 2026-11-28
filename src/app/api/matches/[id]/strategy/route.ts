import { NextRequest, NextResponse } from "next/server";
import { specificStrategy } from "@/lib/listStrategy";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const league = req.nextUrl.searchParams.get("league") || "bra.1";

  /* ACESSO: a melhor linha do confronto é palpite do produto. Mesma regra de
     `/props`. `strategy: null` + `note` mantêm a UI sã: `MatchClient` já desenha
     `spec.note` quando não há estratégia, então o bloqueio aparece como recado
     no lugar do "Nenhuma linha com 70%...". */
  const user = await getUser().catch(() => null);
  if (!user || !(user.isAdmin || user.access.active)) {
    return NextResponse.json(
      {
        locked: true,
        strategy: null,
        alternatives: [],
        error: "Conteúdo VIP. Entre com uma conta ativa para ver a melhor linha deste jogo.",
        note: "Conteúdo VIP: entre com uma conta ativa para liberar a melhor linha deste jogo.",
      },
      { status: user ? 402 : 403 },
    );
  }
  try {
    const data = await specificStrategy(league, id);
    return NextResponse.json(data);
  } catch (e: any) {
    /* 502 com `strategy: null`: a UI já trata o null, mas o status não pode
       fingir sucesso quando o histórico não pôde ser lido. */
    return NextResponse.json({ strategy: null, error: e?.message || "Falha ao ler o histórico." }, { status: 502 });
  }
}