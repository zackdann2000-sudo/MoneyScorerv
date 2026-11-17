import { NextResponse } from "next/server";
import { buscarJogos, diaKey, diaISO, type Jogo } from "@/lib/kingstats";
import { lerJogos, gravarJogos, CACHE_TTL_MS } from "@/lib/kingstats/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Converte um ?date=YYYY-MM-DD em dayKey YYYYMMDD. */
function dayKeyDe(date: string | null): string {
  if (!date) return diaKey();
  const limpo = date.replace(/-/g, "");
  return /^\d{8}$/.test(limpo) ? limpo : diaKey();
}

type JogoUI = {
  id: string;
  liga: string;
  home: string;
  away: string;
  homeId: string;
  awayId: string;
  kickoff: string;
  dia: string;
  esoccer: boolean;
};

function paraUI(j: Jogo, dia: string): JogoUI {
  return {
    id: j.id,
    liga: j.league?.name ?? "",
    home: j.home?.name ?? "",
    away: j.away?.name ?? "",
    homeId: j.home?.id ?? "",
    awayId: j.away?.id ?? "",
    kickoff: j.time,
    dia,
    esoccer: /esoccer/i.test(j.league?.name ?? ""),
  };
}

/**
 * GET /api/kingstats/jogos?date=YYYY-MM-DD
 *
 * A fonte só guarda hoje e dias passados. Se um dia não tiver dados (futuro ou
 * buraco), e o usuário NÃO pediu uma data específica, caminhamos para trás até
 * 7 dias para achar o último dia com jogos — melhor mostrar o último dia cheio
 * do que uma tela vazia.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const pediuData = url.searchParams.get("date");
  const revalidate = url.searchParams.get("revalidate") === "1";

  let dayKey = dayKeyDe(pediuData);

  const emCache = await lerJogos(dayKey);
  if (emCache && !revalidate && emCache.idade < CACHE_TTL_MS && emCache.dados.jogos.length > 0) {
    return NextResponse.json({
      ...emCache.dados,
      dias: null,
      cached: true,
      idadeMs: emCache.idade,
    });
  }

  const { jogos, savedAt } = await buscarJogos(dayKey);

  let usados = jogos;
  let dayKeyFinal = dayKey;

  if (usados.length === 0 && !pediuData) {
    // Fallback: últimos 7 dias.
    for (let i = 1; i <= 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = diaKey(d);
      const r = await buscarJogos(k);
      if (r.jogos.length > 0) {
        usados = r.jogos;
        dayKeyFinal = k;
        break;
      }
    }
  }

  const dia = diaISO(dayKeyFinal);
  const payload = {
    dayKey: dayKeyFinal,
    geradoEm: savedAt ? new Date(savedAt).toISOString() : new Date().toISOString(),
    jogos: usados,
  };

  if (usados.length > 0) await gravarJogos(payload);

  const lista = usados.map((j) => paraUI(j, dia));
  const ligas = [...new Set(lista.filter((j) => !j.esoccer).map((j) => j.liga))].sort();

  return NextResponse.json({
    dayKey: dayKeyFinal,
    dia,
    geradoEm: payload.geradoEm,
    total: lista.length,
    ligas,
    jogos: lista,
    cached: false,
    idadeMs: 0,
  });
}
