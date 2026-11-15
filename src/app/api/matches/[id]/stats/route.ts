import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { playerStatsCache, playerPhotos } from "@/db/schema";
import { getSummaryRaw, matchFromSummary, getTeamHistory, type HistGame } from "@/lib/espn";
import { getKey } from "@/lib/keys";
import {
  smFetch,
  playerStatsComFallback,
  afPlayerStats,
  afFindFixtureId,
  afFixtureFinished,
  type AfPlayerRow,
} from "@/lib/providers";
import { getPlayerPhoto } from "@/lib/theSportsDb";
import { cached } from "@/lib/cache";

export const dynamic = "force-dynamic";

/* ================= Categorias da aba Estatísticas (13 sub-abas) ================= */
export type StatCat =
  | "gols"
  | "assistencias"
  | "finalizacoes"
  | "finalizacoesNoGol"
  | "finalizacoesParaFora"
  | "passes"
  | "desarmes"
  | "interceptacoes"
  | "faltas"
  | "faltasSofridas"
  | "impedimentos"
  | "amarelos"
  | "defesas";

const CATS: { id: StatCat; label: string }[] = [
  { id: "gols", label: "Gols" },
  { id: "assistencias", label: "Assistências" },
  { id: "finalizacoes", label: "Finalizações" },
  { id: "finalizacoesNoGol", label: "Finalizações no Gol" },
  { id: "finalizacoesParaFora", label: "Finalizações para Fora" },
  { id: "passes", label: "Passes" },
  { id: "desarmes", label: "Desarmes" },
  { id: "interceptacoes", label: "Interceptações" },
  { id: "faltas", label: "Faltas" },
  { id: "faltasSofridas", label: "Faltas Sofridas" },
  { id: "impedimentos", label: "Impedimentos" },
  { id: "amarelos", label: "Cartões Amarelos" },
  { id: "defesas", label: "Defesas Goleiro" },
];

/* Pares nome↔nome que o Sportmonks usa nas estatísticas por jogador. */
const SM_TYPES: Record<string, string[]> = {
  gols: ["goals", "goal"],
  assistencias: ["assists", "assist"],
  finalizacoes: ["shots total", "total shots", "shots"],
  finalizacoesNoGol: ["shots on target", "shots on goal"],
  finalizacoesParaFora: ["shots off target", "shots blocked"],
  passes: ["passes", "total passes", "accurate passes"],
  desarmes: ["tackles", "tackles total"],
  interceptacoes: ["interceptions"],
  faltas: ["fouls", "fouls committed"],
  faltasSofridas: ["fouls drawn", "was fouled"],
  impedimentos: ["offsides", "offside"],
  amarelos: ["yellow cards", "yellowcard"],
  defesas: ["saves", "saves total", "goalkeeper saves"],
};

/* ================= Helpers ================= */
function normName(s: string) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .trim();
}

function rank<T extends { total: number; average: number | null }>(rows: T[], n = 5) {
  return rows.sort((a, b) => b.total - a.total || (b.average ?? 0) - (a.average ?? 0)).slice(0, n);
}

/* Agrega o playerMatrix dos jogos do time na ordem cronológica dos HistGames. */
function buildFromHistory(games: HistGame[]) {
  const chronological = [...games].reverse();
  const players = new Map<
    string,
    { name: string; gols: number[]; assistencias: number[]; amarelos: number[]; vermelhos: number[] }
  >();

  const ensure = (name: string) => {
    const key = normName(name);
    if (!key) return null;
    if (!players.has(key)) {
      players.set(key, {
        name,
        gols: new Array(chronological.length).fill(0),
        assistencias: new Array(chronological.length).fill(0),
        amarelos: new Array(chronological.length).fill(0),
        vermelhos: new Array(chronological.length).fill(0),
      });
    }
    return players.get(key)!;
  };

  chronological.forEach((g, i) => {
    const mySide = g.home ? "home" : "away";
    for (const e of g.events) {
      const mine = e.type === "own" ? e.side !== mySide : e.side === mySide;
      if (!mine) continue;
      if (e.type === "goal" || e.type === "pen" || e.type === "own") {
        const p = ensure(e.player);
        if (p) p.gols[i]++;
        if (e.type !== "own") {
          const a = ensure(e.assist || "");
          if (a) a.assistencias[i]++;
        }
      }
      if (e.type === "yellow") {
        const p = ensure(e.player);
        if (p) p.amarelos[i]++;
      }
      if (e.type === "red") {
        const p = ensure(e.player);
        if (p) p.vermelhos[i]++;
      }
    }
  });

  return { list: [...players.values()], games: chronological };
}

/* =======================================================================
   FOTOS — grava no banco uma única vez por jogador.
   Consulta o banco primeiro; só chama o TheSportsDB para quem falta.
   ======================================================================= */
async function enriquecerFotos(
  nomes: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unicos = [...new Set(nomes.map((n) => n.trim()).filter(Boolean))];
  if (!unicos.length) return out;

  const chaveDe = (n: string) => normName(n).replace(/\s+/g, "-");

  /* 1) O que já está no banco. */
  try {
    const rows = await db.select().from(playerPhotos);
    for (const r of rows) {
      if (r.photo) out.set(r.playerKey, r.photo);
      else out.set(r.playerKey, ""); /* "" = já consultado e não existe */
    }
  } catch {
    /* banco indisponível: segue só com a memória */
  }

  /* 2) Faltantes → TheSportsDB (uma vez na vida) e grava. */
  const faltando = unicos.filter((n) => !out.has(chaveDe(n)));
  const resultados = await Promise.all(
    faltando.map(async (nome) => ({ nome, url: await getPlayerPhoto(nome) }))
  );

  for (const { nome, url } of resultados) {
    const key = chaveDe(nome);
    out.set(key, url || "");
    try {
      await db
        .insert(playerPhotos)
        .values({ playerKey: key, playerName: nome, photo: url, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: playerPhotos.playerKey,
          set: { photo: url, updatedAt: new Date() },
        });
    } catch {
      /* não falha a resposta por causa do cache */
    }
  }

  return out;
}

/* =======================================================================
   ESTATÍSTICAS DA PARTIDA — API-Football → banco → Bzzoiro → Sportmonks → ESPN
   ======================================================================= */
async function statsDaPartida(
  matchId: string,
  league: string,
  homeName: string,
  awayName: string,
  isoDate: string,
  encerrada: boolean
): Promise<{ rows: AfPlayerRow[]; source: string; attempts: any[] }> {
  const attempts: any[] = [];

  /* 1) Banco: partida encerrada vale 24h sem tocar na API. */
  try {
    const hit = await db
      .select()
      .from(playerStatsCache)
      .where(eq(playerStatsCache.matchId, matchId))
      .limit(1);
    const row = hit[0];
    if (row) {
      const idade = Date.now() - new Date(row.updatedAt).getTime();
      const vale24h = idade < 24 * 60 * 60 * 1000;
      /* Encerrada: serve do banco por 24h. Em andamento: cache curto de 5min. */
      const ttl = encerrada || row.finalizada ? 24 * 60 * 60 * 1000 : 5 * 60 * 1000;
      if (idade < ttl) {
        attempts.push({ provider: "cache-db", ok: true });
        return { rows: (row.payload as AfPlayerRow[]) || [], source: row.source, attempts };
      }
    }
  } catch {
    attempts.push({ provider: "cache-db", ok: false, reason: "banco indisponível" });
  }

  /* 2) API-Football: 1 requisição para até 13 métricas. */
  const chave = await getKey("api-football").catch(() => "");
  if (chave) {
    try {
      /* ID do fixture: usa cache em memória para não repetir a varredura por data. */
      const achado = await cached(
        `afx:${matchId}:${isoDate}`,
        24 * 60 * 60 * 1000,
        () => afFindFixtureId(homeName, awayName, isoDate)
      );
      if (achado?.id) {
        const rows = await afPlayerStats(achado.id);
        if (rows.length) {
          const fim = encerrada || (await afFixtureFinished(achado.id));
          try {
            await db
              .insert(playerStatsCache)
              .values({
                matchId,
                league,
                source: "API-Football",
                fixtureId: achado.id,
                finalizada: fim,
                payload: rows,
                updatedAt: new Date(),
              })
              .onConflictDoUpdate({
                target: playerStatsCache.matchId,
                set: {
                  source: "API-Football",
                  fixtureId: achado.id,
                  finalizada: fim,
                  payload: rows,
                  updatedAt: new Date(),
                },
              });
            attempts.push({ provider: "api-football", ok: true });
          } catch {
            attempts.push({ provider: "api-football", ok: true, reason: "ok (falhou gravar cache)" });
          }
          return { rows, source: "API-Football", attempts };
        }
        attempts.push({ provider: "api-football", ok: false, reason: "sem estatísticas por jogador" });
      } else {
        attempts.push({ provider: "api-football", ok: false, reason: "jogo não encontrado por nome+data" });
      }
    } catch (e: any) {
      attempts.push({ provider: "api-football", ok: false, reason: String(e?.message || e).slice(0, 140) });
    }
  } else {
    attempts.push({ provider: "api-football", ok: false, reason: "chave não configurada" });
  }

  return { rows: [], source: "indisponível", attempts };
}

/* ================= Rota ================= */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const league = req.nextUrl.searchParams.get("league") || "bra.1";
  const side = req.nextUrl.searchParams.get("side") === "away" ? "away" : "home";

  try {
    const sm = await getSummaryRaw(league, id, "in");
    if (!sm?.header) {
      return NextResponse.json({ error: "Partida não encontrada nesta liga." }, { status: 404 });
    }
    const match = matchFromSummary(sm, league, id);
    const team = side === "home" ? match.home : match.away;
    const adversario = side === "home" ? match.away : match.home;

    const hist = await getTeamHistory(league, team.id, 10);
    const { list, games } = buildFromHistory(hist.games || []);
    const sample = games.length;

    /* Elenco da ESPN para foto/time/posição */
    const roster = sm?.rosters || [];
    const myRoster = roster.find((r: any) => String(r?.team?.id) === String(team.id)) || roster[0];
    const byAthlete = new Map<string, { photo: string; team: string; position: string }>();
    for (const p of myRoster?.roster || []) {
      const nm = p?.athlete?.displayName || "";
      if (!nm) continue;
      byAthlete.set(normName(nm), {
        photo: p?.athlete?.headshot?.href || "",
        team: p?.athlete?.team?.displayName || myRoster?.team?.displayName || team.name,
        position: p?.position?.abbreviation || "",
      });
    }

    const base = list.map((p) => {
      const meta = byAthlete.get(normName(p.name));
      return {
        name: p.name,
        photo: meta?.photo || "",
        position: meta?.position || "",
        team: meta?.team || team.name,
      };
    });

    const result: Record<string, any> = {};
    const usadas = new Set<string>(["ESPN"]);

    /* --- Fonte primária: API-Football (cacheada em banco) --- */
    const encerrada = !!match.finished;
    const partida = await statsDaPartida(
      id,
      league,
      match.home.name,
      match.away.name,
      match.date,
      encerrada
    );

    const jogadoresLado = partida.rows.filter((r) => r.side === side);

    if (jogadoresLado.length) {
      usadas.add(partida.source);
      /* Ranking por categoria, exatamente como a UI espera. */
      for (const cat of CATS) {
        const rows = jogadoresLado
          .map((r, i) => {
            const v = Number((r as any)[cat.id] ?? 0);
            return {
              id: `af-${cat.id}-${i}`,
              name: r.name,
              team: r.team || team.name,
              photo: r.photo || byAthlete.get(normName(r.name))?.photo || "",
              position: r.position || byAthlete.get(normName(r.name))?.position || "",
              total: Number.isFinite(v) ? v : 0,
              average: sample ? +(v / sample).toFixed(2) : null,
              values: new Array(Math.max(sample, 1)).fill(Number.isFinite(v) ? v : 0),
              gameCount: sample,
              source: partida.source,
            };
          })
          .filter((r) => r.total > 0);
        result[cat.id] = rows.length ? rank(rows, 10) : null;
        if (!rows.length) result[`${cat.id}Reason`] = "Sem registro desta métrica nesta partida.";
      }
      result[`afAttempts`] = partida.attempts;
    } else {
      /* --- Fallback: Bzzoiro → Sportmonks → ESPN (só as categorias que existem lá) --- */
      const smKey = await getKey("sportmonks").catch(() => "");

      const smRowsFor = (cat: StatCat) => async () => {
        if (!smKey) return null;
        try {
          const ids = [id, ...games.slice(0, 9).map((g) => g.id)];
          const found = new Map<string, (number | null)[]>();
          await Promise.all(
            ids.map(async (gid, gameIdx) => {
              try {
                const d = await smFetch(`/fixtures/${gid}?include=lineups.details.type`, 300000);
                const lineups = d?.data?.lineups || [];
                const mine = lineups.filter(
                  (l: any) => normName(l?.team?.name || "") === normName(team.name)
                );
                for (const l of mine) {
                  for (const dt of l?.details || []) {
                    const nm = dt?.player?.display_name || dt?.player?.name || "";
                    if (!nm) continue;
                    const tn = String(dt?.type?.name || "").toLowerCase();
                    if (!(SM_TYPES[cat] || []).includes(tn)) continue;
                    let val = 0;
                    val += Number(dt?.value ?? 0) || 0;
                    if (val === 0) continue;
                    const key = normName(nm);
                    if (!found.has(key)) found.set(key, new Array(ids.length).fill(null));
                    const arr = found.get(key)!;
                    arr[ids.length - 1 - gameIdx] = val;
                  }
                }
              } catch {
                /* fonte falhou para este jogo — segue */
              }
            })
          );
          if (found.size === 0) return null;
          return rank(
            [...found.entries()].map(([key, vals], i) => {
              const clean = vals.map((v) => (v == null ? 0 : v));
              const total = clean.reduce((s, v) => s + v, 0);
              const meta = [...base].find((b) => normName(b.name) === key);
              return {
                id: `sm-${cat}-${i}`,
                name: meta?.name || key,
                team: meta?.team || team.name,
                photo: meta?.photo || "",
                position: meta?.position || "",
                total,
                average: sample ? +(total / sample).toFixed(2) : null,
                values: clean,
                gameCount: sample,
                source: "Sportmonks",
              };
            }).filter((r) => r.total > 0),
            10
          );
        } catch {
          return null;
        }
      };

      /* Bzzoiro cobre finalizacoes/faltas/defesas/gols/assistencias/amarelos. */
      const BZ_IDS: StatCat[] = ["finalizacoes", "faltas", "defesas", "gols", "assistencias", "amarelos"];
      const bzObjs = CATS.filter((c) => BZ_IDS.includes(c.id));
      for (const cat of bzObjs) {
        const res = await playerStatsComFallback(cat.id, team.name, smRowsFor(cat.id));
        if (res.data && res.data.length) {
          result[cat.id] = res.data;
          usadas.add(res.source);
        } else {
          result[cat.id] = null;
          result[`${cat.id}Reason`] = "Dados indisponíveis para esta partida.";
        }
        result[`${cat.id}Attempts`] = res.attempts;
      }
      /* Categorias que só a API-Football publica. */
      const soApiFootball = CATS.filter((c) => !BZ_IDS.includes(c.id));
      for (const cat of soApiFootball) {
        result[cat.id] = null;
        result[`${cat.id}Reason`] = "Métrica não disponível nas fontes ativas (requer API-Football).";
      }
      result[`afAttempts`] = partida.attempts;
    }

    /* --- Fotos: ESPN → banco → TheSportsDB (1x por jogador na vida) --- */
    const nomesParaFoto: string[] = [];
    for (const cat of CATS) {
      for (const r of result[cat.id] || []) {
        if (!r.photo) nomesParaFoto.push(r.name);
      }
    }
    if (nomesParaFoto.length) {
      try {
        const fotos = await enriquecerFotos(nomesParaFoto);
        for (const cat of CATS) {
          for (const r of result[cat.id] || []) {
            if (r.photo) continue;
            const url = fotos.get(normName(r.name).replace(/\s+/g, "-"));
            if (url) r.photo = url;
          }
        }
      } catch {
        /* sem fotos: a UI mostra as iniciais */
      }
    }

    /* Ordem estável das fontes. */
    const ordem = ["ESPN", "API-Football", "Bzzoiro", "Sportmonks"];
    const fontes = [...usadas].sort((a, b) => {
      const ia = ordem.indexOf(a);
      const ib = ordem.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

    return NextResponse.json({
      team: { id: team.id, name: team.name, logo: team.logo },
      opponent: { id: adversario.id, name: adversario.name, logo: adversario.logo },
      cats: CATS,
      sample,
      baseParcial: hist.baseParcial,
      sportmonks: !!(await getKey("sportmonks").catch(() => "")),
      stats: result,
      source: fontes.join(" + "),
      fontes,
      updatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Falha ao montar as estatísticas dos jogadores." },
      { status: 502 }
    );
  }
}
