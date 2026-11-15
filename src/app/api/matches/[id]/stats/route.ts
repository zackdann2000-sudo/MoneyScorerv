import { NextRequest, NextResponse } from "next/server";
import { getSummaryRaw, matchFromSummary, getTeamHistory, type HistGame } from "@/lib/espn";
import { getKey } from "@/lib/keys";
import { smFetch, playerStatsComFallback } from "@/lib/providers";

export const dynamic = "force-dynamic";

/* ================= Categorias da aba Estatísticas ================= */
export type StatCat = "gols" | "assistencias" | "finalizacoes" | "cartoes" | "faltas" | "defesas";

const CATS: { id: StatCat; label: string }[] = [
  { id: "gols", label: "Gols" },
  { id: "assistencias", label: "Assistências" },
  { id: "finalizacoes", label: "Finalizações" },
  { id: "cartoes", label: "Cartões" },
  { id: "faltas", label: "Faltas" },
  { id: "defesas", label: "Defesas" },
];

/* Pares nome↔nome que o Sportmonks usa nas estatísticas por jogador.
   Só as 3 últimas categorias chegam por lá — ESPN não publica. */
const SM_TYPES: Record<StatCat, string[]> = {
  gols: ["goals", "goal"],
  assistencias: ["assists", "assist"],
  finalizacoes: ["shots total", "total shots", "shots", "shots off target"],
  cartoes: ["yellow cards", "yellowcard", "cards"],
  faltas: ["fouls", "fouls committed"],
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

/* Agrega o playerMatrix dos jogos do time na ordem cronológica dos HistGames,
   garantindo 10 posições mesmo p/ quem não participou de alguns jogos. */
function buildFromHistory(games: HistGame[]) {
  const chronological = [...games].reverse(); // mais antigo → mais recente
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

function rank<T extends { total: number; average: number | null }>(rows: T[], n = 5) {
  return rows.sort((a, b) => b.total - a.total || (b.average ?? 0) - (a.average ?? 0)).slice(0, n);
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

    const hist = await getTeamHistory(league, team.id, 10);
    const { list, games } = buildFromHistory(hist.games || []);
    const sample = games.length;

    /* Elenco da ESPN (foto + time) para enriquecer os cards */
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
      return { name: p.name, photo: meta?.photo || "", position: meta?.position || "", team: meta?.team || team.name };
    });

    /* ---------- Categorias disponíveis via ESPN (eventos reais) ---------- */
    const mk = (
      cat: StatCat,
      key: StatCat,
      values: (p: (typeof list)[number]) => number[]
    ) => {
      const rows = rank(
        list.map((p, i) => {
          const vals = values(p);
          const total = vals.reduce((s, v) => s + v, 0);
          return {
            id: `${cat}-${i}`,
            name: p.name,
            team: base[i].team,
            photo: base[i].photo,
            position: base[i].position,
            total,
            average: sample ? +(total / sample).toFixed(2) : null,
            values: vals,
            gameCount: sample,
            source: "ESPN",
          };
        }).filter((r) => r.total > 0),
        5
      );
      return rows;
    };

    const result: Record<string, any> = {};

    result.gols = mk("gols", "gols", (p) => p.gols);
    result.assistencias = mk("assistencias", "assistencias", (p) => p.assistencias);
    result.cartoes = mk("cartoes", "cartoes", (p) => p.amarelos.map((a, i) => a + p.vermelhos[i]));

    /* ---------- Categorias que dependem do Sportmonks ---------- */
    let smKey: string | null = null;
    try {
      smKey = await getKey("sportmonks");
    } catch {
      smKey = null;
    }

    const smRowsFor = async (cat: StatCat) => {
      if (!smKey) return null;
      try {
        /* Estatísticas por jogador da partida atual + das últimas 10 do time.
           O Sportmonks só devolve isso em planos com "statistics". */
        const ids = [id, ...games.map((g) => g.id)].slice(0, 10);
        const found = new Map<string, number[]>();

        await Promise.all(
          ids.map(async (fxId, gameIdx) => {
            try {
              const d = await smFetch(
                `/fixtures/${fxId}?include=lineups.player;lineups.details.type`,
                60000
              );
              const lineups = d?.data?.lineups || [];
              for (const l of lineups) {
                const nm = l?.player?.display_name || l?.player?.name || "";
                if (!nm) continue;
                const details = l?.details || [];
                let val = 0;
                const wanted = SM_TYPES[cat];
                for (const dt of details) {
                  const typeName = String(dt?.type?.name || dt?.type?.developer_name || "").toLowerCase();
                  if (wanted.some((w) => typeName.includes(w))) {
                    val += Number(dt?.value ?? 0) || 0;
                  }
                }
                if (val === 0 && details.length === 0) continue;
                const key = normName(nm);
                if (!found.has(key)) found.set(key, new Array(ids.length).fill(null));
                const arr = found.get(key)!;
                /* gameIdx vem da ordem [partida atual, ...últimos jogos]; invertemos p/ cronológico */
                arr[ids.length - 1 - gameIdx] = val;
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
          5
        );
      } catch {
        return null;
      }
    };

    /* Fontes efetivamente usadas: ESPN nos eventos, e para as métricas
       avançadas a fonte que ganhou a cascata (Sportmonks ou Bzzoiro). */
    const usadas = new Set<string>(["ESPN"]);
    for (const cat of ["finalizacoes", "faltas", "defesas"] as StatCat[]) {
      const res = await playerStatsComFallback(cat, team.name, () => smRowsFor(cat));
      if (res.data && res.data.length) {
        result[cat] = res.data;
        usadas.add(res.source);
      } else {
        result[cat] = null;
        result[`${cat}Reason`] = "Dados indisponíveis para esta partida.";
      }
      result[`${cat}Attempts`] = res.attempts;
    }

    /* Ordem estável: ESPN primeiro, depois as fontes de estatística. */
    const ordem = ["ESPN", "Sportmonks", "Bzzoiro"];
    const fontes = [...usadas].sort((a, b) => {
      const ia = ordem.indexOf(a);
      const ib = ordem.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

    return NextResponse.json({
      team: { id: team.id, name: team.name, logo: team.logo },
      cats: CATS,
      sample,
      baseParcial: hist.baseParcial,
      sportmonks: !!smKey,
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
