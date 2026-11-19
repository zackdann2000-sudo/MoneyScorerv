import { NextRequest, NextResponse } from "next/server";
import { getPropsDoTime, montarJogadores, PROPS_DISABLED, PROPS_MAX_JOGOS } from "@/lib/playerProps";
import { montarCards } from "@/lib/playerPropsEngine";
import { resumoH2HProps } from "@/lib/h2hPropsSummary";
import { getUser } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/matches/[id]/props?league=bra.1&home=Flamengo&away=Palmeiras
 *
 * Cards de Player Props por mercado (Top 3) + resumo H2H dos últimos 5 jogos.
 * Cache-first: cada time fica 24h em `player_props_cache`; sem cache, a
 * primeira visita gasta ~N jogos por time na API-Football.
 *
 * `?api=0` força modo somente-cache.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sp = req.nextUrl.searchParams;

  // 1) Gate VIP: props gastam cota paga, então só conta ativa/admin.
  const user = await getUser().catch(() => null);
  if (!user || !(user.isAdmin || user.access.active)) {
    return NextResponse.json(
      { locked: true, error: "Conteúdo VIP. Entre com uma conta ativa para ver os props." },
      { status: user ? 402 : 403 },
    );
  }

  // 2) Rate limit por IP (20/h) — barra enumeração de jogos.
  const limite = await rateLimit("props:ip", clientIp(req), { limit: 20, windowSec: 3600 });
  if (!limite.ok) {
    return NextResponse.json(
      { locked: true, error: "Muitas requisições. Tente novamente mais tarde." },
      { status: 429, headers: { "Retry-After": String(limite.retryAfterSec) } },
    );
  }

  const league = sp.get("league") || "bra.1";
  const home = String(sp.get("home") || "").trim();
  const away = String(sp.get("away") || "").trim();
  const permitirApi = sp.get("api") !== "0";

  if (!home || !away) {
    return NextResponse.json({ error: "Informe os nomes dos dois times (home/away)." }, { status: 400 });
  }
  if (PROPS_DISABLED) {
    return NextResponse.json({ cards: [], h2h: null, desativado: true, motivo: "PLAYER_PROPS_DISABLED=1" });
  }

  try {
    const [casa, fora, h2h] = await Promise.all([
      getPropsDoTime(home, { permitirApi }),
      getPropsDoTime(away, { permitirApi }),
      resumoH2HProps(league, id, home, away),
    ]);

    const jogadores = montarJogadores(casa, fora);
    const cards = montarCards(jogadores);

    return NextResponse.json({
      cards,
      h2h,
      amostra: {
        casa: casa?.sample ?? 0,
        fora: fora?.sample ?? 0,
        maxJogos: PROPS_MAX_JOGOS,
        temporadaCasa: casa?.season ?? null,
        temporadaFora: fora?.season ?? null,
      },
      fontes: { casa: casa?.fonte ?? null, fora: fora?.fonte ?? null },
      semDados: cards.length === 0,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha ao montar props." }, { status: 502 });
  }
}