import { NextRequest, NextResponse } from "next/server";
import { getAllMatches, todayYmd, type Match } from "@/lib/espn";
import { scanLiveAlertaSafe } from "@/lib/alertScan";
import { attachStrategies } from "@/lib/listStrategy";

export const dynamic = "force-dynamic";

/** YYYYMMDD do dia anterior (a ESPN agrupa por dia UTC). */
function diaAnterior(dia: string): string {
  const d = new Date(`${dia.slice(0, 4)}-${dia.slice(4, 6)}-${dia.slice(6, 8)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Data do calendário de Brasília (YYYY-MM-DD) de um horário ISO. */
function diaSP(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
  } catch {
    return "";
  }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const dia = (sp.get("date") || todayYmd()).replace(/\D/g, "").slice(0, 8);
  const leagues = sp.get("leagues")?.split(",").filter(Boolean);
  const liveOnly = sp.get("live") === "1";

  /* A ESPN lista por dia UTC: um jogo das 21h de Brasília cai no dia seguinte.
     Para a partida não sumir quando termina, buscamos o dia pedido E o anterior
     e mantemos só os jogos cujo calendário de Brasília é o dia pedido. O filtro
     é por data — nunca por hora — então o jogo encerrado fica na lista com o
     placar final até a virada do dia. */
  const pedido = `${dia.slice(0, 4)}-${dia.slice(4, 6)}-${dia.slice(6, 8)}`;
  const [doDia, doAnterior] = await Promise.all([
    getAllMatches(dia, leagues).catch(() => [] as Match[]),
    getAllMatches(diaAnterior(dia), leagues).catch(() => [] as Match[]),
  ]);

  const porId = new Map<string, Match>();
  for (const m of [...doDia, ...doAnterior]) {
    if (!porId.has(m.id) && diaSP(m.date) === pedido) porId.set(m.id, m);
  }
  const raw = [...porId.values()].sort(
    (a, b) => a.date.localeCompare(b.date),
  );

  const withTips = await attachStrategies(raw).catch(() => raw.map((m) => ({ ...m, strategy: null })));
  if (liveOnly || withTips.some((m) => m.live)) scanLiveAlertaSafe();
  const matches = liveOnly ? withTips.filter((m) => m.live) : withTips;
  return NextResponse.json({
    date: dia, now: Date.now(), count: matches.length, live: matches.filter((m) => m.live).length,
    finished: matches.filter((m) => m.finished).length,
    matches, source: "ESPN",
  });
}
