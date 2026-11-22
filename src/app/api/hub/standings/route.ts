/**
 * Classificação persistida — LEITURA (S10 / S11).
 *
 *   GET /api/hub/standings?league=bra.1
 *   GET /api/hub/standings?league=BSA&stage=Group%20A&season=2026-2027
 *
 * `league` aceita três formas, resolvidas por `resolverLigaId`:
 *   - código ESPN ("bra.1", "ita.1")  ← o que as telas já usam
 *   - código Football-Data ("BSA", "SA")
 *   - slug ou id interno
 *
 * Não faz NENHUMA chamada de rede: o retrato é escrito pelo cron
 * `/api/cron/hub-standings`. Fornecedor fora do ar não derruba esta rota —
 * que é a razão de a tabela existir.
 */
import { NextRequest, NextResponse } from "next/server";
import { lerClassificacao, resolverLigaId } from "@/lib/hub/standings";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const entrada = params.get("league") || params.get("liga") || "bra.1";

  const leagueId = await resolverLigaId(entrada);
  if (!leagueId) {
    return NextResponse.json(
      {
        error: "Competição não encontrada no banco do Hub.",
        hint: "A tabela é populada pelo cron /api/cron/hub-standings. Sem sync ainda, não há retrato.",
        league: entrada,
      },
      { status: 404 },
    );
  }

  const dados = await lerClassificacao(leagueId, {
    stage: params.get("stage") ?? undefined,
    seasonKey: params.get("season") ?? undefined,
  });

  if (!dados) {
    return NextResponse.json(
      {
        error: "Ainda não há classificação gravada para esta competição.",
        leagueId,
        hint: "Rode o cron /api/cron/hub-standings para gravar o primeiro retrato.",
      },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      league: dados.leagueName,
      leagueId: dados.leagueId,
      slug: dados.leagueSlug,
      season: dados.seasonKey,
      stage: dados.stageName,
      stages: dados.stages,
      /* A regra vai junto para a UI poder explicar por que o time está em 4º. */
      tiebreak: dados.tiebreak,
      regra: dados.regraTexto,
      hasKnockout: dados.hasKnockout,
      updatedAt: dados.updatedAt,
      /* Tabela de copa sem fase de grupos: a UI mostra bracket, não "sem dados". */
      emptyReason: dados.rows.length === 0 && dados.hasKnockout ? "knockout" : null,
      rows: dados.rows,
    },
    {
      headers: {
        // Curto: o cron roda de hora em hora; não faz sentido cachear mais.
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
