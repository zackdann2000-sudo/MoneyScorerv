import { NextRequest, NextResponse } from "next/server";
import { getAllMatches, todayYmd, type Match } from "@/lib/espn";
import { isMainLeague, isMainLeagueCode } from "@/lib/mainLeagues";
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
  /* Falha de fonte x dia sem jogos: antes as duas virávam lista vazia e a tela
     dizia "nenhum jogo" mesmo quando a ESPN estava fora (403/blip). Agora a
     falha é contada e sobe como `error`/`degradado` para o empty state poder
     dizer a verdade. */
  const falhas: string[] = [];
  const [doDia, doAnterior] = await Promise.all([
    getAllMatches(dia, leagues).catch((e) => {
      falhas.push(String(e?.message || e || "falha").slice(0, 120));
      return [] as Match[];
    }),
    getAllMatches(diaAnterior(dia), leagues).catch((e) => {
      falhas.push(String(e?.message || e || "falha").slice(0, 120));
      return [] as Match[];
    }),
  ]);

  const porId = new Map<string, Match>();
  for (const m of [...doDia, ...doAnterior]) {
    if (!porId.has(m.id) && diaSP(m.date) === pedido) porId.set(m.id, m);
  }
  const raw = [...porId.values()].sort(
    (a, b) => a.date.localeCompare(b.date),
  );

  /* LISTA FECHADA nas 16. A ESPN devolve 24 ligas — Bolívia, México, Chile,
     Colômbia, 2. Bundesliga, Liga Portugal... Nenhuma pode chegar à tela de
     Ligas nem ao feed de jogos. O casamento é por código ESPN ("eng.1") e, se
     o código for desconhecido, pelo nome + país (fonte que só dá nome). */
  const principais = raw.filter(
    (m) => isMainLeagueCode("espn", m.league) || isMainLeague(m.leagueName, m.country),
  );

  const withTips = await attachStrategies(principais).catch(() => principais.map((m) => ({ ...m, strategy: null })));
  if (liveOnly || withTips.some((m) => m.live)) scanLiveAlertaSafe();
  const matches = liveOnly ? withTips.filter((m) => m.live) : withTips;
  /* `error` só quando NADA veio e ao menos uma chamada falhou: assim o cliente
     não acusa erro num dia legitimamente sem jogos. */
  const semDados = matches.length === 0 && falhas.length > 0;

  return NextResponse.json({
    date: dia, now: Date.now(), count: matches.length, live: matches.filter((m) => m.live).length,
    finished: matches.filter((m) => m.finished).length,
    matches, source: "ESPN",
    ...(falhas.length ? { degradado: true, falhas: falhas.slice(0, 2) } : {}),
    ...(semDados ? { error: "A fonte de dados (ESPN) não respondeu agora." } : {}),
  });
}
