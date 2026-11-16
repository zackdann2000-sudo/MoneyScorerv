/**
 * Proxy do "Props Radar" do GameRead.
 *
 * GET /api/gameread/props-radar?date=YYYY-MM-DD&limit=200&group=jogador&minHit=70
 *
 * Já vem ordenado por score de oportunidade (decrescente). Os filtros são
 * aplicados AQUI e não no cliente de propósito: o payload real tem centenas de
 * props, e mandar tudo para o browser desperdiça banda e ainda expõe linhas que
 * o usuário não pediu.
 *
 * Módulo isolado: nada fora de /gameread e /api/gameread usa isto.
 */
import { NextRequest, NextResponse } from "next/server";
import { getPropsRadar, isValidDateIso, localDateIso, CACHE_TTL_MS } from "@/lib/gameread";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const dateParam = sp.get("date") ?? localDateIso();
  if (!isValidDateIso(dateParam)) {
    return NextResponse.json({ error: "date inválido, use YYYY-MM-DD" }, { status: 400 });
  }

  const revalidate = sp.get("revalidate") === "1";
  const limit = Math.min(Math.max(Number(sp.get("limit") ?? 200), 1), 1000);
  const group = sp.get("group"); // gols | cantos | jogador | outros
  const minHit = Number(sp.get("minHit") ?? 0);
  const market = sp.get("market");
  const league = (sp.get("league") ?? "").toLowerCase();

  try {
    const res = await getPropsRadar(dateParam, revalidate);

    let rows = res.rows;
    if (group) rows = rows.filter((r) => r.marketGroup === group);
    if (market) rows = rows.filter((r) => r.market === market);
    if (league) rows = rows.filter((r) => r.leagueName.toLowerCase().includes(league));
    if (Number.isFinite(minHit) && minHit > 0) {
      rows = rows.filter((r) => (r.hitRateL10 ?? 0) >= minHit);
    }

    const total = rows.length;
    rows = [...rows].sort((a, b) => b.score - a.score).slice(0, limit);

    const markets = Array.from(new Set(res.rows.map((r) => r.market))).sort();
    const leagues = Array.from(new Set(res.rows.map((r) => r.leagueName))).sort();

    return NextResponse.json({
      date: dateParam,
      count: rows.length,
      total,
      markets,
      leagues,
      props: rows,
      cache: {
        source: res.source,
        ageSeconds: Math.round(res.ageMs / 1000),
        ttlSeconds: CACHE_TTL_MS / 1000,
      },
      disclaimer:
        "Dados públicos do GameRead. Taxa de acerto passada não garante resultado futuro.",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "falha ao buscar props", props: [], count: 0 },
      { status: 502 },
    );
  }
}
