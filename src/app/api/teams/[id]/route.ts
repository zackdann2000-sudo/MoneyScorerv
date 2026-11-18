import { NextRequest, NextResponse } from "next/server";
import { getTeamInfo, getSchedule, getTeamHistory, getSummaryRaw, normLineups } from "@/lib/espn";
import { getUser } from "@/lib/auth";
import { JANELA_FORMA, mediaPonderada } from "@/lib/formaRecente";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const league = req.nextUrl.searchParams.get("league") || "bra.1";
  try {
    const [info, sched, hist] = await Promise.all([
      getTeamInfo(league, id).catch(() => null),
      getSchedule(league, id),
      getTeamHistory(league, id, 10),
    ]);
    const user = await getUser();
    const vip = !!user && (user.isAdmin || user.access.active);
    const g = hist.games;
    /* Médias com peso da forma recente (1.5 nos 3 últimos, 1.0 do 4º ao 7º,
       0.5 do 8º ao 10º) — não é mais a média chapada dos 10 jogos. */
    const avg = (f: (x: typeof g[number]) => number | null) =>
      mediaPonderada(g.slice(0, JANELA_FORMA).map((x) => f(x))).media;
    const lastFinished = sched.events.filter((e) => e.finished).sort((a, b) => b.date.localeCompare(a.date))[0];
    let lineup: any = null, basedOn = "";
    if (vip && lastFinished) {
      try {
        const sm = await getSummaryRaw(league, lastFinished.id, "post");
        const lu = normLineups(sm, lastFinished.home.id);
        lineup = String(id) === lastFinished.home.id ? lu.home : lu.away;
        basedOn = `${lastFinished.home.name} x ${lastFinished.away.name} · ${new Date(lastFinished.date).toLocaleDateString("pt-BR")}`;
      } catch {}
    }
    return NextResponse.json({
      info, league,
      last: sched.events.filter((e) => e.finished).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10),
      next: sched.events.filter((e) => !e.finished).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5),
      form: g.slice(0, 5).map((x) => x.res),
      averages: {
        jogos: Math.min(g.length, JANELA_FORMA), gols: avg((x) => x.gf), sofridos: avg((x) => x.ga),
        escanteios: avg((x) => x.corners), faltas: avg((x) => x.fouls), amarelos: avg((x) => x.yellow),
        vermelhos: avg((x) => x.red), impedimentos: avg((x) => x.offsides),
        chutesGol: avg((x) => x.sot), finalizacoes: avg((x) => x.shots), posse: avg((x) => x.poss), xgEst: avg((x) => x.xgEst),
        v: g.filter((x) => x.res === "V").length, e: g.filter((x) => x.res === "E").length, d: g.filter((x) => x.res === "D").length,
      },
      /* Base das médias, para a UI poder dizer de onde vem o número. */
      baseMedia: `últimos ${Math.min(g.length, JANELA_FORMA)} jogos (peso maior nos 3 mais recentes)`,
      lineupProvavel: lineup, lineupBase: basedOn, vip,
      baseParcial: hist.baseParcial, fonte: "ESPN", updatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha ao buscar time." }, { status: 502 });
  }
}