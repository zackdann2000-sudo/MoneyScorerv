import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { matchTeamStatsCache } from "@/db/schema";
import { getSummaryRaw, matchFromSummary } from "@/lib/espn";
import { getKey } from "@/lib/keys";
import { afTeamStats, afFindFixtureId, afFixtureFinished, type TeamStatMetric } from "@/lib/providers";
import { fiveDollarFindFixture, fiveDollarTeamStats, MAPEAMENTO_LIGAS } from "@/lib/fiveDollar";
import { goalApiFetch } from "@/lib/goalApi";
import { cached } from "@/lib/cache";

export const dynamic = "force-dynamic";

/* Janelas de validade do cache (ms). */
const TTL_ENCERRADA = 24 * 60 * 60 * 1000; /* dado definitivo */
const TTL_AO_VIVO = 5 * 60 * 1000; /* muda a cada lance */

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const league = req.nextUrl.searchParams.get("league") || "bra.1";

  try {
    const sm = await getSummaryRaw(league, id, "in");
    if (!sm?.header) {
      return NextResponse.json({ error: "Partida não encontrada nesta liga." }, { status: 404 });
    }
    const match = matchFromSummary(sm, league, id);
    const encerrada = !!match.finished;
    const ttl = encerrada ? TTL_ENCERRADA : TTL_AO_VIVO;

    /* ---------- 1) Banco ---------- */
    let cacheMotivo = "miss";
    try {
      const rows = await db
        .select()
        .from(matchTeamStatsCache)
        .where(eq(matchTeamStatsCache.matchId, id))
        .limit(1);
      const row = rows[0];
      if (row) {
        const idade = Date.now() - new Date(row.updatedAt).getTime();
        const vale = idade < (row.finalizada ? TTL_ENCERRADA : TTL_AO_VIVO);
        if (vale) {
          /* O payload pode ser a lista de métricas ou o envelope { metrics, splits }. */
          const bruto = row.payload as any;
          const pMetrics: TeamStatMetric[] = Array.isArray(bruto) ? bruto : bruto?.metrics || [];
          const pSplits = Array.isArray(bruto) ? null : bruto?.splits || null;
          const p1 = pSplits?.primeiroTempo || [];
          const p2 = pSplits?.segundoTempo || [];
          return NextResponse.json({
            metrics: pMetrics,
            source: row.source,
            cache: "hit",
            finalizada: row.finalizada,
            updatedAt: row.updatedAt,
            primeiroTempo: p1,
            segundoTempo: p2,
            temSplits: p1.length > 0 && p2.length > 0,
          });
        }
        cacheMotivo = "expirado";
      }
    } catch {
      cacheMotivo = "banco-indisponivel";
    }

    /* ---------- 2) Partida não iniciada: não gasta cota ---------- */
    if (!match.live && !match.finished) {
      return NextResponse.json({
        metrics: [],
        pendente: true,
        cache: cacheMotivo,
        mensagem: "As estatísticas comparativas aparecem assim que a bola rolar.",
        updatedAt: new Date().toISOString(),
      });
    }

    /* Resultado da cascata: quem entregou, o que entregou e os splits. */
    let metrics: TeamStatMetric[] = [];
    let primeiroTempo: TeamStatMetric[] = [];
    let segundoTempo: TeamStatMetric[] = [];
    let fonte = "";
    let fixtureIdUsado = "";
    let fim = encerrada;

    /* ---------- 3) 5DollarFootballAPI (prioridade máxima: entrega 1º tempo) ----------
       Só cobre as 5 grandes ligas europeias no plano Free; fora delas a
       listagem volta vazia e a cascata segue sem gastar nada. */
    if (MAPEAMENTO_LIGAS[league]) {
      try {
        const achado5 = await cached(
          `fd5:${id}:${match.date}`,
          24 * 60 * 60 * 1000,
          () => fiveDollarFindFixture(match.home.name, match.away.name, match.date, league)
        );

        if (achado5?.id) {
          const r5 = await fiveDollarTeamStats(achado5.id);
          if (r5.metrics.length) {
            /* Mando do 5Dollar pode vir invertido: viramos o par de lados. */
            const virar = (lista: TeamStatMetric[]) =>
              achado5.invertido
                ? lista.map((m) => ({ ...m, home: m.away, away: m.home }))
                : lista;

            metrics = virar(r5.metrics);
            primeiroTempo = virar(r5.primeiroTempo);
            segundoTempo = virar(r5.segundoTempo);
            fonte = "5DollarFootballAPI";
            fixtureIdUsado = String(achado5.id);
            fim = r5.finalizada || encerrada;
          }
        }
      } catch {
        /* fonte indisponível: cai para a API-Football */
      }
    }

    /* ---------- 4) API-Football ---------- */
    if (!metrics.length) {
      const chave = await getKey("api-football").catch(() => "");
      if (chave) {
        try {
          const achado = await cached(
            `afx:${id}:${match.date}`,
            24 * 60 * 60 * 1000,
            () => afFindFixtureId(match.home.name, match.away.name, match.date)
          );
          if (achado?.id) {
            const af = await afTeamStats(achado.id);
            if (af.metrics.length) {
              metrics = af.metrics;
              fonte = "API-Football";
              fixtureIdUsado = String(achado.id);
              fim = encerrada || (await afFixtureFinished(achado.id));
            }
          }
        } catch {
          /* cai para a GOAL API */
        }
      }
    }

    /* ---------- 5) GOAL API (fallback para xG e estatísticas) ---------- */
    if (!metrics.length) {
      try {
        const g = await goalApiFetch<any>(`/fixtures/${fixtureIdUsado || id}/statistics`);
        const linhas: any[] = (g.ok && (g.data as any)?.statistics) || [];
        if (linhas.length) {
          const num = (v: any) => {
            const s = String(v ?? "").replace("%", "");
            const n = Number(s);
            return Number.isFinite(n) ? n : 0;
          };
          const norm = (t: string) => String(t || "").toLowerCase().replace(/[^a-z]/g, "");
          const MAPA: Record<string, { key: string; label: string; percent?: boolean }> = {
            ballpossession: { key: "ball_possession", label: "Posse de bola", percent: true },
            possession: { key: "ball_possession", label: "Posse de bola", percent: true },
            expectedgoals: { key: "expected_goals", label: "xG (gols esperados)" },
            xg: { key: "expected_goals", label: "xG (gols esperados)" },
            totalshots: { key: "total_shots", label: "Finalizações" },
            shots: { key: "total_shots", label: "Finalizações" },
            shotsongoal: { key: "shots_on_goal", label: "Finalizações no gol" },
            shotsontarget: { key: "shots_on_goal", label: "Finalizações no gol" },
            cornerkicks: { key: "corner_kicks", label: "Escanteios" },
            corners: { key: "corner_kicks", label: "Escanteios" },
            fouls: { key: "fouls", label: "Faltas" },
            yellowcards: { key: "yellow_cards", label: "Cartões amarelos" },
            redcards: { key: "red_cards", label: "Cartões vermelhos" },
          };
          const vistos = new Set<string>();
          for (const l of linhas) {
            const def = MAPA[norm(l.type ?? l.name ?? "")];
            if (!def || vistos.has(def.key)) continue;
            const h = num(l.home ?? l.value?.home);
            const a = num(l.away ?? l.value?.away);
            if (!Number.isFinite(h) && !Number.isFinite(a)) continue;
            vistos.add(def.key);
            metrics.push({ key: def.key, label: def.label, home: h, away: a, percent: def.percent });
          }
          if (metrics.length) fonte = "GOAL API";
        }
      } catch {
        /* sem fonte: mensagem amigável abaixo */
      }
    }

    /* ---------- 6) Nada encontrado ---------- */
    if (!metrics.length) {
      return NextResponse.json({
        metrics: [],
        cache: cacheMotivo,
        pendente: !encerrada && !match.live,
        mensagem: "Estatísticas comparativas ainda não publicadas para esta partida.",
      });
    }

    /* ---------- 7) Grava no banco (mesma tabela, mesma regra de TTL) ---------- */
    try {
      await db
        .insert(matchTeamStatsCache)
        .values({
          matchId: id,
          league,
          source: fonte,
          fixtureId: fixtureIdUsado,
          finalizada: fim,
          /* Guardamos também os splits: sem isso o 1º/2º tempo sumiria
             no segundo acesso e a feature só funcionaria no cache miss. */
          payload: {
            metrics,
            splits:
              primeiroTempo.length && segundoTempo.length
                ? { primeiroTempo, segundoTempo }
                : null,
          } as any,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: matchTeamStatsCache.matchId,
          set: {
            source: fonte,
            fixtureId: fixtureIdUsado,
            finalizada: fim,
            payload: {
              metrics,
              splits:
                primeiroTempo.length && segundoTempo.length
                  ? { primeiroTempo, segundoTempo }
                  : null,
            } as any,
            updatedAt: new Date(),
          },
        });
    } catch {
      /* cache é otimização: não falha a resposta */
    }

    return NextResponse.json({
      metrics,
      source: fonte,
      cache: cacheMotivo,
      finalizada: fim,
      ttlMs: ttl,
      /* Só expomos os splits quando existe 1º tempo real. */
      primeiroTempo,
      segundoTempo,
      temSplits: primeiroTempo.length > 0 && segundoTempo.length > 0,
      updatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Falha ao montar as estatísticas do time." },
      { status: 502 }
    );
  }
}
