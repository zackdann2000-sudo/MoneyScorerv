import { NextRequest, NextResponse } from "next/server";
import { getSummaryRaw, matchFromSummary, getTeamHistory } from "@/lib/espn";
import { mercadosDoJogo } from "@/lib/mercadosPoisson";
import { ancorasPinnaclePorEspnId, comAncoras } from "@/lib/oddsPinnacle";
import { montarCombos, type Perna } from "@/lib/comboBuilder";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/combos/build
 *
 * Body: { matchId, league?, homeId?, awayId?, homeName?, awayName? }
 *
 * Monta 3 combos (Seguro / Equilibrado / Ousado) a partir dos mercados Poisson
 * do jogo. Duas travas de honestidade:
 *  - só entra perna com odd da Pinnacle (âncora); sem âncora não há EV;
 *  - pernas correlacionadas são marcadas e o EV do combo vira `null`.
 *
 * A conta é toda da função pura `montarCombos`; a rota só busca dado e aplica
 * rate limit — nada de fornecedor novo.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const rl = await rateLimit("combos", ip, { limit: 20, windowSec: 60 * 60 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Muitas combinações em pouco tempo. Tente de novo em alguns minutos." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 60) } },
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const matchId = String(body?.matchId || "").trim();
  const league = String(body?.league || "bra.1");
  if (!matchId) return NextResponse.json({ error: "matchId é obrigatório." }, { status: 400 });

  let homeId = String(body?.homeId || "").trim();
  let awayId = String(body?.awayId || "").trim();
  let homeName = String(body?.homeName || "").trim();
  let awayName = String(body?.awayName || "").trim();

  try {
    if (!homeId || !awayId || !homeName || !awayName) {
      const sm = await getSummaryRaw(league, matchId, "in").catch(() => null);
      const m = sm ? matchFromSummary(sm, league, matchId) : null;
      homeId = homeId || m?.home?.id || "";
      awayId = awayId || m?.away?.id || "";
      homeName = homeName || m?.home?.name || "Mandante";
      awayName = awayName || m?.away?.name || "Visitante";
    }
    if (!homeId || !awayId) {
      return NextResponse.json({ error: "Não foi possível identificar os dois times." }, { status: 400 });
    }

    const [casa, fora] = await Promise.all([
      getTeamHistory(league, homeId, 10).catch(() => null),
      getTeamHistory(league, awayId, 10).catch(() => null),
    ]);
    if (!casa || !fora) {
      return NextResponse.json({ error: "Histórico recente indisponível na fonte para estes times." }, { status: 502 });
    }

    const mercados = comAncoras(mercadosDoJogo(casa.games, fora.games), await ancorasPinnaclePorEspnId(matchId));
    const fixtureNum = Number(matchId) || 0;
    const matchLabel = `${homeName} × ${awayName}`;

    const pernas: Perna[] = mercados
      .filter((m) => m.prob != null && m.prob > 0)
      .map((m) => ({
        chave: `match:${matchId}:${m.id}`,
        fixtureId: fixtureNum,
        origem: "mercado" as const,
        matchLabel,
        rotulo: m.rotulo,
        mercadoId: m.id,
        grupo: m.grupo,
        prob: m.prob as number,
        odd: m.oddAncora ?? null,
        estimado: m.estimado,
      }));

    const comOdd = pernas.filter((p) => p.odd != null);
    const combos = montarCombos(pernas);
    const aviso =
      combos.length > 0
        ? null
        : comOdd.length === 0
          ? "A Pinnacle não cotou nenhum destes mercados para este jogo — sem âncora não há combo nem EV."
          : "Só há uma perna com odd de âncora neste jogo; combinada precisa de duas.";

    return NextResponse.json({
      combos,
      pernas: pernas.length,
      comAncora: comOdd.length,
      ancora: "Pinnacle",
      amostra: { casa: casa.games.length, fora: fora.games.length },
      fonte: "ESPN + Pinnacle (hub)",
      aviso,
      updatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha ao montar os combos." }, { status: 502 });
  }
}
