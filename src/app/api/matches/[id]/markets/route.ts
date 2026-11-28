import { NextRequest, NextResponse } from "next/server";
import { getSummaryRaw, matchFromSummary, getTeamHistory } from "@/lib/espn";
import { filtrarMelhores, mercadosDoJogo } from "@/lib/mercadosPoisson";
import { ancorasPinnaclePorEspnId, comAncoras } from "@/lib/oddsPinnacle";
import { getUser } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * GET /api/matches/[id]/markets?league=bra.1&home=<teamId>&away=<teamId>
 *
 * Mercados específicos (BTTS, 0.5+ gols do 1º tempo por time, 1.5+ gols do jogo
 * e de cada time, 4.5+ escanteios do 1º tempo e 8.5+ escanteios do jogo) com
 * probabilidade Poisson calculada sobre os últimos 10 jogos reais dos dois
 * times (ESPN). Sem 10 jogos na fonte, o mercado sai como "sem dados".
 *
 * Os ids dos times vêm por query (a tela de jogo já os tem). Se faltarem, a
 * rota resolve pelo summary do evento — uma chamada extra, nunca um número
 * inventado.
 *
 * CUSTO E ACESSO: cada chamada faz até 3 requisições à ESPN (summary + 2
 * históricos) mais a leitura de odds, então a rota tem o MESMO gate de VIP de
 * `/props` (conta ativa/admin) e o MESMO rate limit por IP. O corpo do 402/403/
 * 429 traz `mercados`/`melhores` vazios porque `MercadosTab` monta as listas
 * com `data?.mercados ?? []` e já exibe `error` como aviso.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sp = req.nextUrl.searchParams;
  const league = sp.get("league") || "bra.1";
  let home = String(sp.get("home") || "").trim();
  let away = String(sp.get("away") || "").trim();

  // 1) Gate VIP: os mercados com EV são conteúdo do produto.
  const user = await getUser().catch(() => null);
  if (!user || !(user.isAdmin || user.access.active)) {
    return NextResponse.json(
      {
        locked: true,
        error: "Conteúdo VIP. Entre com uma conta ativa para ver os mercados deste jogo.",
        mercados: [],
        melhores: [],
      },
      { status: user ? 402 : 403 },
    );
  }

  // 2) Rate limit por IP (20/h) — barra enumeração de jogos/custo de ESPN.
  const limite = await rateLimit("markets:ip", clientIp(req), { limit: 20, windowSec: 3600 });
  if (!limite.ok) {
    return NextResponse.json(
      {
        locked: true,
        error: "Muitas requisições. Tente novamente mais tarde.",
        mercados: [],
        melhores: [],
      },
      { status: 429, headers: { "Retry-After": String(limite.retryAfterSec) } },
    );
  }

  try {
    if (!home || !away) {
      const sm = await getSummaryRaw(league, id, "in");
      const match = sm ? matchFromSummary(sm, league, id) : null;
      home = home || match?.home?.id || "";
      away = away || match?.away?.id || "";
    }
    if (!home || !away) {
      return NextResponse.json(
        { error: "Não foi possível identificar os dois times desta partida." },
        { status: 400 },
      );
    }

    const [casa, fora] = await Promise.all([
      getTeamHistory(league, home, 10).catch(() => null),
      getTeamHistory(league, away, 10).catch(() => null),
    ]);
    if (!casa || !fora) {
      return NextResponse.json(
        { error: "Histórico recente indisponível na fonte para estes times." },
        { status: 502 },
      );
    }

    const mercados = comAncoras(mercadosDoJogo(casa.games, fora.games), await ancorasPinnaclePorEspnId(id));

    // EV e radar SEMPRE na odd da Pinnacle; mercado sem âncora depende só da
    // probabilidade e nunca ganha EV de casa menor.
    const oddes = Object.fromEntries(mercados.map((m) => [m.id, m.oddAncora ?? null]));
    const melhores = filtrarMelhores(mercados, oddes);

    return NextResponse.json({
      mercados,
      melhores,
      ancora: "Pinnacle",
      comAncora: mercados.filter((m) => m.oddAncora != null).length,
      amostra: { casa: casa.games.length, fora: fora.games.length },
      fonte: "ESPN",
      updatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Falha ao calcular os mercados." },
      { status: 502 },
    );
  }
}
