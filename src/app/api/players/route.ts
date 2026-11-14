import { NextRequest, NextResponse } from "next/server";
import { getLeaders, LEAGUES } from "@/lib/espn";
import { getKey } from "@/lib/keys";
import { fdScorers } from "@/lib/providers";

export const dynamic = "force-dynamic";

const CAT_PT: Record<string, string> = {
  goals: "Gols", assists: "Assistências", shots: "Finalizações", shotsOnTarget: "Chutes no Gol",
  foulsCommitted: "Faltas Cometidas", foulsSuffered: "Faltas Sofridas", yellowCards: "Cartões Amarelos",
  redCards: "Cartões Vermelhos", offsides: "Impedimentos", saves: "Defesas (GOL)", tackles: "Desarmes",
  interceptions: "Interceptações", totalGoals: "Participações em Gols",
};
const FD_MAP: Record<string, string> = { "eng.1": "PL", "esp.1": "PD", "ita.1": "SA", "ger.1": "BL1", "fra.1": "FL1", "bra.1": "BSA", "por.1": "PPL", "ned.1": "DED", "uefa.champions": "CL" };
const POS_MAP: Record<string, string[]> = {
  G: ["G", "GK", "Goalkeeper"], D: ["D", "CB", "LB", "RB", "Defence", "Defender", "Zagueiro", "Lateral"],
  M: ["M", "CM", "DM", "AM", "Midfield", "Midfielder", "Volante", "Meio-campista"], F: ["F", "FW", "ST", "LW", "RW", "Offence", "Attacker", "Atacante", "Ponta"],
};

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const league = sp.get("league") || "eng.1";
  const cat = sp.get("cat") || "goals";
  const q = (sp.get("q") || "").toLowerCase();
  const pos = sp.get("pos") || "";
  const team = (sp.get("team") || "").toLowerCase();
  const minMatches = parseInt(sp.get("min") || "0") || 0;
  const order = sp.get("order") === "asc" ? 1 : -1;
  const metric = sp.get("metric") || "value";
  const page = Math.max(1, parseInt(sp.get("page") || "1") || 1);
  const per = 15;

  const { season, stats } = await getLeaders(league);
  const available = (stats || []).map((s: any) => {
    const id = String(s.name || "").replace(/Leaders$/, "");
    return { id, label: CAT_PT[id] || s.displayName || id, count: s.leaders?.length || 0 };
  }).filter((c: any) => c.count > 0);

  const stat = (stats || []).find((s: any) => s.name === `${cat}Leaders`) || (stats || []).find((s: any) => String(s.name).toLowerCase().startsWith(cat.toLowerCase()));
  let rows = (stat?.leaders || []).map((l: any, i: number) => {
    const a = l?.athlete || {};
    const dv = String(l?.displayValue || "");
    const matches = parseInt(dv.match(/M(?:atches)?:?\s*(\d+)/i)?.[1] || "0") || null;
    return {
      rank: i + 1, id: String(a.id || i), name: a.displayName || "—", short: a.shortName || "",
      photo: a.headshot?.href || "", team: a.team?.displayName || l?.team?.displayName || "",
      teamLogo: a.team?.logos?.[0]?.href || a.team?.logo || l?.team?.logo || "",
      nationality: a.flag?.alt || a.citizenship || "", position: a.position?.abbreviation || a.position?.displayName || "",
      value: Number(l?.value ?? 0), displayValue: dv, matches,
      perGame: matches ? +(Number(l?.value ?? 0) / matches).toFixed(2) : null,
      assists: null as number | null, penalties: null as number | null, source: "ESPN",
    };
  });

  // Complemento Football-Data.org (jogos, assistências, pênaltis, nacionalidade, posição)
  let fdUsed = false;
  const fdKey = await getKey("footballdata");
  if (fdKey && FD_MAP[league] && ["goals", "assists"].includes(cat)) {
    try {
      const fd = await fdScorers(FD_MAP[league], undefined, 50);
      fdUsed = true;
      const byName = new Map(fd.rows.map((r: any) => [String(r.name).toLowerCase(), r]));
      rows = rows.map((r: any) => {
        const f: any = byName.get(r.name.toLowerCase()) || [...byName.values()].find((x: any) => String(x.name).toLowerCase().includes(r.short?.toLowerCase?.() || "###"));
        if (!f) return r;
        return { ...r, matches: f.played ?? r.matches, assists: f.assists, penalties: f.penalties, nationality: f.nationality || r.nationality, position: f.position || r.position, team: r.team || f.team, teamLogo: r.teamLogo || f.teamLogo, perGame: f.played ? +(r.value / f.played).toFixed(2) : r.perGame, source: "ESPN + Football-Data" };
      });
      if (cat === "goals") {
        const known = new Set(rows.map((r: any) => r.name.toLowerCase()));
        for (const f of fd.rows as any[]) {
          if (known.has(String(f.name).toLowerCase())) continue;
          rows.push({ rank: 0, id: `fd-${f.id}`, name: f.name, short: "", photo: "", team: f.team || "", teamLogo: f.teamLogo || "", nationality: f.nationality || "", position: f.position || "", value: cat === "goals" ? f.goals : (f.assists ?? 0), displayValue: `${f.played ?? "?"} jogos`, matches: f.played, perGame: f.played ? +((cat === "goals" ? f.goals : f.assists ?? 0) / f.played).toFixed(2) : null, assists: f.assists, penalties: f.penalties, source: "Football-Data.org" });
        }
      }
    } catch {}
  }

  // Filtros combináveis reais
  if (q) rows = rows.filter((r: any) => r.name.toLowerCase().includes(q) || r.team.toLowerCase().includes(q));
  if (team) rows = rows.filter((r: any) => r.team.toLowerCase().includes(team));
  if (pos && POS_MAP[pos]) rows = rows.filter((r: any) => POS_MAP[pos].some((p) => String(r.position).toLowerCase() === p.toLowerCase()));
  if (minMatches > 0) rows = rows.filter((r: any) => (r.matches ?? 99) >= minMatches);
  rows.sort((a: any, b: any) => order * ((metric === "perGame" ? (a.perGame ?? 0) - (b.perGame ?? 0) : a.value - b.value)));
  rows = rows.map((r: any, i: number) => ({ ...r, rank: i + 1 }));
  const total = rows.length;
  const paged = rows.slice((page - 1) * per, page * per);

  return NextResponse.json({
    league, leagueName: LEAGUES.find((l) => l.code === league)?.name || league, season, cat, rows: paged, total, page, pages: Math.max(1, Math.ceil(total / per)),
    available, fdUsed,
    matrix: [
      { metric: "Gols / Assistências / Pênaltis", espn: true, fd: true, note: "Pênaltis via Football-Data.org" },
      { metric: "Finalizações / Chutes no gol", espn: available.some((a: any) => a.id.toLowerCase().includes("shot")), fd: false, note: "Líderes ESPN" },
      { metric: "Faltas / Cartões / Impedimentos", espn: available.some((a: any) => ["foulscommitted", "yellowcards", "offsides"].includes(a.id.toLowerCase())), fd: false, note: "Quando disponível na liga" },
      { metric: "Média por 90min / Minutos jogados", espn: false, fd: false, note: "Requer Sportmonks (plano com minutos)" },
      { metric: "Passes / Duelos / xG individual", espn: false, fd: false, note: "Requer Sportmonks ou fonte avançada" },
    ],
    source: fdUsed ? "ESPN + Football-Data.org" : "ESPN", updatedAt: new Date().toISOString(),
  });
}