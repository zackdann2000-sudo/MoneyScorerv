/**
 * Comparativo entre os dois times de um jogo.
 *
 * GET /api/gameread/fixtures/{id}/comparison
 *
 * Traz o que a tela de detalhe precisa: probabilidade de vitória, forma recente
 * e médias por janela (5/10/20 jogos) — incluindo xG, finalizações, cantos e
 * posse. Devolvemos também as métricas já pareadas (casa × fora) para a UI não
 * precisar saber o nome de cada campo.
 */
import { NextRequest, NextResponse } from "next/server";
import { getComparison, getFixture, CACHE_TTL_MS } from "@/lib/gameread";

export const dynamic = "force-dynamic";

type WindowSide = Record<string, unknown>;

type WinChance = { homePercent?: number; awayPercent?: number; drawPercent?: number };

/** Só os campos do fixture que esta rota usa (evita `any`). */
type GrFixtureDetail = {
  league?: { name?: string; logoUrl?: string };
  kickoffUtc?: string;
  status?: string;
  round?: string | null;
  venue?: string | null;
  referee?: string | null;
};

/** Métricas exibidas na comparação, na ordem em que aparecem na tela. */
const METRICS: { key: string; label: string; suffix?: string; decimals?: number }[] = [
  { key: "goalsScored", label: "Gols marcados", decimals: 2 },
  { key: "goalsConceded", label: "Gols sofridos", decimals: 2 },
  { key: "xg", label: "xG (gols esperados)", decimals: 2 },
  { key: "shots", label: "Finalizações", decimals: 1 },
  { key: "shotsOnTarget", label: "No alvo", decimals: 1 },
  { key: "shotsConceded", label: "Finalizações sofridas", decimals: 1 },
  { key: "corners", label: "Cantos", decimals: 1 },
  { key: "cornersConceded", label: "Cantos sofridos", decimals: 1 },
  { key: "possession", label: "Posse de bola", suffix: "%", decimals: 1 },
  { key: "foulsCommitted", label: "Faltas cometidas", decimals: 1 },
  { key: "tackles", label: "Desarmes", decimals: 1 },
  { key: "passes", label: "Passes", decimals: 0 },
];

function round(v: unknown, decimals = 2): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10 ** decimals) / 10 ** decimals;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const revalidate = req.nextUrl.searchParams.get("revalidate") === "1";

  try {
    // Fixture e comparison em paralelo: são independentes.
    const [cmpRes, fxRes] = await Promise.allSettled([
      getComparison(id, revalidate),
      getFixture(id, revalidate),
    ]);

    if (cmpRes.status === "rejected") throw cmpRes.reason;

    const cmp = cmpRes.value.data as {
      home?: { id?: string; name?: string; logoUrl?: string };
      away?: { id?: string; name?: string; logoUrl?: string };
      winChance?: WinChance;
      windows?: { window: number; home: WindowSide; away: WindowSide }[];
    };

    const fixture = fxRes.status === "fulfilled" ? (fxRes.value.data as GrFixtureDetail) : null;

    // Escolhe a janela mais próxima de 10 jogos (padrão que o site usa).
    const windows = cmp.windows ?? [];
    const chosen = windows.find((w) => w.window === 10) ?? windows[0] ?? null;

    const rows = chosen
      ? METRICS.map((m) => {
          const home = round(chosen.home?.[m.key], m.decimals ?? 2);
          const away = round(chosen.away?.[m.key], m.decimals ?? 2);
          const total = (home ?? 0) + (away ?? 0);
          return {
            key: m.key,
            label: m.label,
            suffix: m.suffix ?? "",
            home,
            away,
            /** Proporção para a barra comparativa (0..100), só quando há base. */
            homeShare: total > 0 ? Math.round(((home ?? 0) / total) * 100) : 50,
          };
        })
      : [];

    return NextResponse.json({
      fixtureId: id,
      fixture: fixture
        ? {
            league: fixture.league?.name ?? null,
            leagueLogo: fixture.league?.logoUrl ?? null,
            kickoffUtc: fixture.kickoffUtc ?? null,
            status: fixture.status ?? null,
            round: fixture.round ?? null,
            venue: fixture.venue ?? null,
            referee: fixture.referee ?? null,
          }
        : null,
      home: cmp.home ?? null,
      away: cmp.away ?? null,
      winChance: {
        home: round(cmp.winChance?.homePercent, 1),
        draw: round(cmp.winChance?.drawPercent ?? null, 1),
        away: round(cmp.winChance?.awayPercent, 1),
      },
      window: chosen?.window ?? null,
      /** Forma recente como sequência de resultados: "WWDLW". */
      form: {
        home: typeof chosen?.home?.form === "string" ? chosen.home.form : null,
        away: typeof chosen?.away?.form === "string" ? chosen.away.form : null,
      },
      metrics: rows,
      availableWindows: windows.map((w) => w.window),
      cache: {
        source: cmpRes.value.source,
        ageSeconds: Math.round(cmpRes.value.ageMs / 1000),
        ttlSeconds: CACHE_TTL_MS / 1000,
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "falha ao buscar comparação",
        metrics: [],
      },
      { status: 502 },
    );
  }
}
