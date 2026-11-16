/**
 * Proxy dos jogos do dia do GameRead.
 *
 * GET /api/gameread/fixtures?date=YYYY-MM-DD&league=<trecho>&live=1
 *
 * Devolve os jogos agrupados por liga (formato original) e também uma lista
 * achatada (`all`) para o cliente filtrar sem percorrer os grupos.
 */
import { NextRequest, NextResponse } from "next/server";
import { getFixturesDay, isValidDateIso, localDateIso, CACHE_TTL_MS } from "@/lib/gameread";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const dateParam = sp.get("date") ?? localDateIso();
  if (!isValidDateIso(dateParam)) {
    return NextResponse.json({ error: "date inválido, use YYYY-MM-DD" }, { status: 400 });
  }

  const revalidate = sp.get("revalidate") === "1";
  const league = (sp.get("league") ?? "").toLowerCase();
  const onlyLive = sp.get("live") === "1";

  try {
    const res = await getFixturesDay(dateParam, revalidate);
    const groups = Array.isArray(res.data) ? res.data : [];

    const all = groups.flatMap((g) =>
      (g.fixtures ?? []).map((f) => ({
        id: f.id,
        kickoffUtc: f.kickoffUtc ?? null,
        status: f.status ?? null,
        isLive: f.isLive === true,
        elapsedMinutes: f.elapsedMinutes ?? null,
        leagueId: g.league?.id ?? "",
        leagueName: g.league?.name ?? "",
        leagueLogo: g.league?.logoUrl ?? "",
        leaguePriority: g.league?.priority ?? 999,
        homeName: f.home?.name ?? "",
        homeLogo: f.home?.logoUrl ?? "",
        awayName: f.away?.name ?? "",
        awayLogo: f.away?.logoUrl ?? "",
        homeGoals: f.homeGoals ?? null,
        awayGoals: f.awayGoals ?? null,
      })),
    );

    let filtered = all;
    if (league) filtered = filtered.filter((f) => f.leagueName.toLowerCase().includes(league));
    if (onlyLive) filtered = filtered.filter((f) => f.isLive);

    filtered.sort((a, b) => (a.kickoffUtc ?? "").localeCompare(b.kickoffUtc ?? ""));

    return NextResponse.json({
      date: dateParam,
      count: filtered.length,
      total: all.length,
      leagues: Array.from(new Set(all.map((f) => f.leagueName))).sort(),
      fixtures: filtered,
      cache: {
        source: res.source,
        ageSeconds: Math.round(res.ageMs / 1000),
        ttlSeconds: CACHE_TTL_MS / 1000,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "falha ao buscar jogos", fixtures: [], count: 0 },
      { status: 502 },
    );
  }
}
