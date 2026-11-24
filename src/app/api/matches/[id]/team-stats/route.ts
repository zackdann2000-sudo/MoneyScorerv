import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { matchTeamStatsCache } from "@/db/schema";
import { getSummaryRaw, matchFromSummary, normStats } from "@/lib/espn";
import { splitDoEspn } from "@/lib/espnTempos";
import { getKey } from "@/lib/keys";
import { afTeamStats, afFindFixtureId, afFixtureFinished, type TeamStatMetric } from "@/lib/providers";
import { smFindFixtureId, smTeamStats } from "@/lib/providers";
import { fiveDollarFindFixture, fiveDollarTeamStats, MAPEAMENTO_LIGAS } from "@/lib/fiveDollar";
import { goalApiFetch } from "@/lib/goalApi";
import { cached } from "@/lib/cache";
import { getUser } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/*
 * ESPN (boxscore) usa chaves próprias — `possessionPct`, `totalShots`, … — e
 * nenhuma delas existia nas categorias de filtro da UI. Resultado: a lista era
 * montada e o filtro `principais` (default) a esvaziava, e a tela dizia
 * "Nenhuma métrica disponível" mesmo com o ESPN cheio. Aqui as chaves viram o
 * vocabulário canônico (o mesmo da API-Football e do SportMonks).
 */
const ESPN_KEY_MAP: Record<string, string> = {
  possessionPct: "ball_possession",
  totalShots: "total_shots",
  shotsOnTarget: "shots_on_goal",
  wonCorners: "corner_kicks",
  foulsCommitted: "fouls",
  offsides: "offsides",
  yellowCards: "yellow_cards",
  redCards: "red_cards",
  saves: "goalkeeper_saves",
  totalPasses: "total_passes",
  accuratePasses: "passes_accurate",
  passPct: "pass_pct",
  totalTackles: "total_tackles",
  interceptions: "interceptions",
  totalClearance: "total_clearance",
  blockedShots: "blocked_shots",
  totalCrosses: "total_crosses",
  penaltyKickGoals: "penalty_kick_goals",
};

/* Janelas de validade do cache (ms). */
const TTL_ENCERRADA = 24 * 60 * 60 * 1000; /* dado definitivo */
const TTL_AO_VIVO = 5 * 60 * 1000; /* muda a cada lance */

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  // Rate limit primeiro (20/h por IP): protege cota e CPU em rota pública.
  const limite = await rateLimit("team-stats:ip", clientIp(req), { limit: 20, windowSec: 3600 });
  if (!limite.ok) {
    return NextResponse.json({ locked: true, error: "Muitas requisições. Tente novamente mais tarde." }, { status: 429, headers: { "Retry-After": String(limite.retryAfterSec) } });
  }

  // Free/anônimo recebe o comparativo da ESPN; o resto (API-Football/Bzzoiro/Sportmonks) é VIP.
  const user = await getUser().catch(() => null);
  const vip = !!user && (user.isAdmin || user.access.active);

  const league = req.nextUrl.searchParams.get("league") || "bra.1";

  try {
    const sm = await getSummaryRaw(league, id, "in");
    if (!sm?.header) {
      return NextResponse.json({ error: "Partida não encontrada nesta liga." }, { status: 404 });
    }
    const match = matchFromSummary(sm, league, id);
    const encerrada = !!match.finished;
    const ttl = encerrada ? TTL_ENCERRADA : TTL_AO_VIVO;

    /* Comparativo do ESPN (grátis, sem cota): serve de base para todo mundo e
       de fallback do bloco VIP. Antes só o visitante free usava esses números,
       então em jogo sem 5Dollar/API-Football o assinante ficava com a tela
       vazia mesmo com o ESPN cheio de estatística. */
    const metricsEspn: TeamStatMetric[] = normStats(sm, match.home.id).map((s: any) => {
      const num = (v: any) => {
        const n = Number(String(v ?? "0").replace("%", "").replace(",", "."));
        return Number.isFinite(n) ? n : 0;
      };
      const chave = ESPN_KEY_MAP[String(s.key)] || String(s.key);
      /* O ESPN manda precisão de passe como fração (0.9). Em percentual
         (90%) para não aparecer "0.9" do lado de "43.5" de posse. */
      const escala = (v: any) => {
        const n = num(v);
        return chave === "pass_pct" && n <= 1 ? +(n * 100).toFixed(1) : n;
      };
      const pct = /%/.test(String(s.home ?? "")) || chave === "ball_possession" || chave === "pass_pct";
      return {
        key: chave,
        label: String(s.label),
        home: escala(s.home),
        away: escala(s.away),
        percent: pct,
      };
    });

    /* Recorte de 1º/2º tempo do ESPN (linescores + keyEvents): é o único que
       cobre Brasileirão — o SportMonks só tem a liga do plano dele. */
    const splitEspn = splitDoEspn(sm);

    /* ---------- 0) FREE/ANÔNIMO: comparativo só com a ESPN (zero cota paga) ---------- */
    if (!vip) {
      return NextResponse.json({
        metrics: metricsEspn,
        source: "ESPN",
        cache: "espn",
        finalizada: encerrada,
        updatedAt: new Date().toISOString(),
        primeiroTempo: splitEspn.primeiroTempo,
        segundoTempo: splitEspn.segundoTempo,
        temSplits: splitEspn.primeiroTempo.length > 0 && splitEspn.segundoTempo.length > 0,
        jogadoresBloqueados: true,
        locked: false,
      });
    }

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
        /* O payload pode ser a lista de métricas ou o envelope { metrics, splits }. */
        const bruto = row.payload as any;
        const pMetrics: TeamStatMetric[] = Array.isArray(bruto) ? bruto : bruto?.metrics || [];
        const pSplits = Array.isArray(bruto) ? null : bruto?.splits || null;
        const p1 = pSplits?.primeiroTempo || [];
        const p2 = pSplits?.segundoTempo || [];
        const temSplitNoCache = p1.length > 0 && p2.length > 0;
        /* Cache sem split continua sendo cache: devolvemos, mas só depois de
           tentar o SportMonks (a cascata abaixo). Sem isso, uma linha gravada
           antes do split existir esconderia 1º/2º tempo por 24h. */
        if (vale && (temSplitNoCache || !match.finished)) {
          return NextResponse.json({
            metrics: pMetrics,
            source: row.source,
            cache: "hit",
            finalizada: row.finalizada,
            updatedAt: row.updatedAt,
            primeiroTempo: p1,
            segundoTempo: p2,
            temSplits: temSplitNoCache,
          });
        }
        cacheMotivo = vale ? "hit-sem-split" : "expirado";
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

    /* Resultado da cascata: quem entregou, o que entregou e os splits.
       O split já nasce do ESPN; o SportMonks só troca quando tem métrica de
       período de verdade (posse/finalização), não só o placar. */
    let metrics: TeamStatMetric[] = [];
    let primeiroTempo: TeamStatMetric[] = splitEspn.primeiroTempo;
    let segundoTempo: TeamStatMetric[] = splitEspn.segundoTempo;
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

    /* ---------- 5) SportMonks — split de 1º/2º tempo (periods.statistics) ----------
       Entra quando falta o comparativo OU quando falta o split: é a única fonte
       que publica estatística por período. Não existe parâmetro `current_half`
       na API v3; o recorte vem de `include=periods.statistics` (type_id 1 e 2). */
    if (!metrics.length || !(primeiroTempo.length && segundoTempo.length)) {
      const smKey = await getKey("sportmonks").catch(() => "");
      if (smKey) {
        try {
          const smId = await cached(
            `smfx:${id}:${match.date}`,
            24 * 60 * 60 * 1000,
            () => smFindFixtureId(match.home.name, match.away.name, match.date)
          );
          if (smId) {
            const rsm = await smTeamStats(smId);
            if (rsm.metrics.length) {
              /* O comparativo da SportMonks cobre só uma parte das métricas:
                 completa o que já veio de outra fonte em vez de trocar tudo. */
              if (!metrics.length) {
                metrics = rsm.metrics;
                fonte = "Sportmonks";
                fixtureIdUsado = String(smId);
              } else {
                const existentes = new Set(metrics.map((m) => m.key));
                metrics = [...metrics, ...rsm.metrics.filter((m) => !existentes.has(m.key))];
              }
              /* O split do SportMonks só vale se tiver mais que o placar: com só
                 "gols" o do ESPN (que também traz cartões) é igual ou melhor. */
              const smTemMetrica = rsm.primeiroTempo.some((m) => m.key !== "goals");
              if (smTemMetrica) {
                primeiroTempo = rsm.primeiroTempo;
                segundoTempo = rsm.segundoTempo;
              }
              fim = fim || rsm.finalizada;
            }
          }
        } catch {
          /* sem split: os toggles de tempo ficam travados na UI */
        }
      }
    }

    /* ---------- 6) GOAL API (fallback para xG e estatísticas) ---------- */
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

    /* ---------- 6b) ESPN como último recurso do comparativo ----------
       Chega aqui quando as fontes pagas não responderam (5Dollar fora da liga,
       API-Football suspensa, SportMonks sem o campeonato). O ESPN já está na
       mão — usar é melhor que mostrar "nenhuma métrica disponível". */
    if (!metrics.length && metricsEspn.length) {
      metrics = metricsEspn;
      fonte = "ESPN";
    }

    /* ---------- 7) Nada encontrado ---------- */
    if (!metrics.length) {
      return NextResponse.json({
        metrics: [],
        cache: cacheMotivo,
        pendente: !encerrada && !match.live,
        mensagem: "Estatísticas comparativas ainda não publicadas para esta partida.",
      });
    }

    /* ---------- 8) Grava no banco (mesma tabela, mesma regra de TTL) ---------- */
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
