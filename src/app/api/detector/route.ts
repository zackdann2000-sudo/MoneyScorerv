import { NextRequest, NextResponse } from "next/server";
import { getAllMatches, getTeamHistory, todayYmd, LEAGUES, type HistGame } from "@/lib/espn";
import { oddFromHit } from "@/lib/engine";
import { filtroLigasPrincipais } from "@/lib/mainLeagues";

export const dynamic = "force-dynamic";

type MetricDef = { id: string; label: string; cat: string; periodo: string; lines: number[]; get: (g: HistGame) => number | null };
const METRICS: MetricDef[] = [
  { id: "gf", label: "Gols Marcados", cat: "Gols", periodo: "Jogo todo", lines: [0.5, 1.5, 2.5], get: (g) => g.gf },
  { id: "gf_ht", label: "Gols Marcados", cat: "Gols", periodo: "1º Tempo", lines: [0.5, 1.5], get: (g) => g.htGf },
  { id: "total", label: "Gols na Partida", cat: "Gols", periodo: "Jogo todo", lines: [1.5, 2.5, 3.5], get: (g) => g.gf + g.ga },
  { id: "btts", label: "Ambas Marcam", cat: "Ambas Marcam", periodo: "Jogo todo", lines: [0.5], get: (g) => (g.gf > 0 && g.ga > 0 ? 1 : 0) },
  { id: "wins", label: "Vitórias", cat: "Vitórias", periodo: "Jogo todo", lines: [0.5], get: (g) => (g.res === "V" ? 1 : 0) },
  { id: "corners", label: "Escanteios (Time)", cat: "Escanteios", periodo: "Jogo todo", lines: [3.5, 4.5, 5.5], get: (g) => g.corners },
  { id: "corners_total", label: "Escanteios (Jogo)", cat: "Escanteios", periodo: "Jogo todo", lines: [7.5, 8.5, 9.5, 10.5], get: (g) => (g.corners != null && g.oppCorners != null ? g.corners + g.oppCorners : null) },
  { id: "yellow", label: "Cartões (Time)", cat: "Cartões", periodo: "Jogo todo", lines: [0.5, 1.5, 2.5], get: (g) => g.yellow },
  { id: "fouls", label: "Faltas Cometidas", cat: "Faltas", periodo: "Jogo todo", lines: [8.5, 10.5, 12.5], get: (g) => g.fouls },
  { id: "offsides", label: "Impedimentos", cat: "Impedimentos", periodo: "Jogo todo", lines: [0.5, 1.5, 2.5], get: (g) => g.offsides },
  { id: "sot", label: "Chutes no Gol", cat: "Finalizações", periodo: "Jogo todo", lines: [2.5, 3.5, 4.5], get: (g) => g.sot },
  { id: "shots", label: "Finalizações", cat: "Finalizações", periodo: "Jogo todo", lines: [9.5, 12.5, 14.5], get: (g) => g.shots },
];

export async function GET() {
  return NextResponse.json({
    metrics: METRICS.map(({ id, label, cat, periodo, lines }) => ({ id, label, cat, periodo, lines })),
    leagues: LEAGUES.map((l) => ({ code: l.code, name: l.name, flag: l.flag, country: l.country })),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const date = String(body.date || todayYmd()).replace(/-/g, "");
    const league = String(body.league || "all");
    const metricId = String(body.metric || "gf");
    const line = Number(body.line ?? 0.5);
    const sample = body.sample === 5 ? 5 : 10;
    const local = ["home", "away", "both"].includes(body.local) ? body.local : "both";
    if (!METRICS.find((m) => m.id === metricId)) return NextResponse.json({ error: "Métrica inválida." }, { status: 400 });
    const def = METRICS.find((m) => m.id === metricId)!;

    let matches = await getAllMatches(date, league === "all" ? undefined : [league]);
    matches = matches.filter((m) => m.state !== "post");
    /* Filtro de "principais" = catálogo real (`mainLeagues`), nunca a lista
       paralela de `priority` do espn.ts: aquela cobria só 10 códigos e deixava
       8 ligas permitidas de fora. */
    if (league === "all") matches = matches.filter(filtroLigasPrincipais);
    const scanned = matches.length;
    matches = matches.slice(0, 6);

    const results: any[] = [];
    await Promise.all(matches.map(async (m) => {
      const sides: ("home" | "away")[] = local === "home" ? ["home"] : local === "away" ? ["away"] : ["home", "away"];
      for (const side of sides) {
        const team = side === "home" ? m.home : m.away;
        const hist = await getTeamHistory(m.league, team.id, sample).catch(() => null);
        if (!hist) continue;
        let games = hist.games;
        if (local !== "both") { const filtered = games.filter((g) => (local === "home" ? g.home : !g.home)); if (filtered.length >= 3) games = filtered; }
        const vals = games.map(def.get).filter((v): v is number => v != null);
        if (vals.length < 3) continue;
        const acertos = vals.filter((v) => v > line).length;
        const pct = acertos / vals.length;
        if (pct < 0.7) continue;
        results.push({
          match: { id: m.id, league: m.league, leagueName: m.leagueName, flag: m.flag, country: m.country, date: m.date, home: m.home, away: m.away, state: m.state },
          team: { id: team.id, name: team.name, logo: team.logo, side },
          mercado: `${def.label} +${line}`.replace("+0.5", def.id === "wins" ? "Vencer" : "+0.5"),
          periodo: def.periodo, acertos, total: vals.length, pct: Math.round(pct * 100),
          hist: [...vals].reverse().map((v) => ({ v, hit: v > line })),
          media: +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2),
          oddEstimada: oddFromHit(pct), baseParcial: vals.length < sample,
        });
      }
    }));
    results.sort((a, b) => b.pct - a.pct || (b.oddEstimada ?? 0) - (a.oddEstimada ?? 0));
    return NextResponse.json({ results, scanned, analyzed: matches.length, fonte: "ESPN", updatedAt: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha na busca." }, { status: 502 });
  }
}