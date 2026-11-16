/**
 * Linhas de mercado de um jogo (com hit rates L5/L10/L20).
 *
 * GET /api/gameread/fixtures/{id}/lines?market=&minHit=&group=1&limit=80
 *
 * O endpoint original devolve ~400 itens porque repete a MESMA linha para cada
 * casa de aposta (Betfair 1.22, 1xBet 1.24, BetVictor 1.22...). Devolver isso
 * cru polui a tela. Aqui agrupamos por (mercado, seleção, linha), escolhemos a
 * melhor odd do grupo e listamos as casas que oferecem aquela linha — o usuário
 * precisa saber ONDE apostar, não ver a mesma prop três vezes.
 *
 * `group=0` desliga o agrupamento e devolve os itens crus (para depuração).
 */
import { NextRequest, NextResponse } from "next/server";
import { getFixtureLines, marketLabel, CACHE_TTL_MS } from "@/lib/gameread";

export const dynamic = "force-dynamic";

/** 1 → 100, 0.875 → 87.5. Valores já em 0..100 passam direto. */
function pct100(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return v <= 1 ? Math.round(v * 1000) / 10 : Math.round(v * 10) / 10;
}

type OutLine = {
  oddId: string;
  market: string;
  marketLabel: string;
  selection: string;
  line: number | null;
  /** Melhor preço entre as casas. */
  price: number | null;
  bestBook: string | null;
  /** Todas as casas que oferecem esta linha, da melhor para a pior odd. */
  books: { name: string; price: number }[];
  bookCount: number;
  playerName: string | null;
  playerPhoto: string | null;
  playerPosition: string | null;
  availability: string | null;
  injuryReason: string | null;
  probableStarter: boolean | null;
  hitRateL5: number | null;
  hitRateL10: number | null;
  hitRateL20: number | null;
  hitsL10: number | null;
  h2h: boolean;
};

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sp = req.nextUrl.searchParams;
  const revalidate = sp.get("revalidate") === "1";
  const marketFilter = sp.get("market");
  const minHit = Number(sp.get("minHit") ?? 0);
  const wantGroups = sp.get("group") !== "0";
  const limit = Math.min(Math.max(Number(sp.get("limit") ?? 80), 1), 500);

  try {
    const res = await getFixtureLines(id, revalidate);
    const items = res.data?.items ?? [];

    const mapped: OutLine[] = items.map((it) => ({
      oddId: it.oddId,
      market: it.market,
      marketLabel: it.marketName || marketLabel(it.market),
      selection: it.selection,
      line: it.line ?? null,
      price: it.price ?? null,
      bestBook: it.bookmakerName ?? null,
      books: it.bookmakerName && it.price != null ? [{ name: it.bookmakerName, price: it.price }] : [],
      bookCount: it.bookmakerName ? 1 : 0,
      playerName: it.playerName ?? null,
      playerPhoto: it.playerPhotoUrl ?? null,
      playerPosition: it.playerPosition ?? null,
      availability: it.availabilityStatus ?? null,
      injuryReason: it.injuryReason ?? null,
      probableStarter: it.probableStarter ?? null,
      hitRateL5: pct100(it.hitRateL5),
      hitRateL10: pct100(it.hitRateL10),
      hitRateL20: pct100(it.hitRateL20),
      hitsL10: it.hitL10Hits ?? null,
      h2h: it.headToHeadBased === true,
    }));

    let rows: OutLine[] = mapped;

    if (wantGroups) {
      // Agrupa pela identidade lógica da linha. `playerName` entra na chave:
      // "Over 1.5 do Mbappé" e "Over 1.5 do Vinícius" são props distintas.
      const groups = new Map<string, OutLine>();
      for (const row of mapped) {
        const key = [row.market, row.selection, row.line ?? "na", row.playerName ?? "-"].join("|");
        const current = groups.get(key);
        if (!current) {
          groups.set(key, { ...row, books: [...row.books] });
          continue;
        }
        // Mescla as casas, mantendo ordenado da melhor odd para a pior.
        current.books.push(...row.books);
        current.bookCount = current.books.length;
        if ((row.price ?? 0) > (current.price ?? 0)) {
          current.price = row.price;
          current.bestBook = row.bestBook;
          current.oddId = row.oddId;
        }
        // Taxas: mantém a maior observada (dados devem ser iguais, mas se
        // divergirem a maior favorece a leitura de tendência).
        current.hitRateL10 = Math.max(current.hitRateL10 ?? 0, row.hitRateL10 ?? 0) || null;
        current.hitRateL5 = Math.max(current.hitRateL5 ?? 0, row.hitRateL5 ?? 0) || null;
        current.hitRateL20 = Math.max(current.hitRateL20 ?? 0, row.hitRateL20 ?? 0) || null;
      }
      rows = Array.from(groups.values()).map((r) => {
        const deduped = new Map<string, number>();
        for (const b of r.books) {
          const prev = deduped.get(b.name);
          if (prev == null || b.price > prev) deduped.set(b.name, b.price);
        }
        const books = Array.from(deduped, ([name, price]) => ({ name, price })).sort(
          (a, b) => b.price - a.price,
        );
        return { ...r, books, bookCount: books.length };
      });
    }

    if (marketFilter) rows = rows.filter((r) => r.market === marketFilter);
    if (Number.isFinite(minHit) && minHit > 0) rows = rows.filter((r) => (r.hitRateL10 ?? 0) >= minHit);

    rows = rows
      .sort((a, b) => (b.hitRateL10 ?? -1) - (a.hitRateL10 ?? -1) || (b.price ?? 0) - (a.price ?? 0))
      .slice(0, limit);

    const markets = Array.from(new Set(items.map((i) => i.market))).sort();

    return NextResponse.json({
      fixtureId: id,
      count: rows.length,
      total: items.length,
      totalAvailable: res.data?.totalAvailable ?? items.length,
      markets,
      lines: rows,
      cache: {
        source: res.source,
        ageSeconds: Math.round(res.ageMs / 1000),
        ttlSeconds: CACHE_TTL_MS / 1000,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "falha ao buscar linhas", lines: [], count: 0 },
      { status: 502 },
    );
  }
}
