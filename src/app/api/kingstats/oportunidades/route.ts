import { NextResponse } from "next/server";
import { buscarJogos, buscarStats, diaKey, diaISO, type Jogo } from "@/lib/kingstats";
import { montarOportunidades } from "@/lib/kingstats/modelo";
import { lerJogos, gravarJogos, lerOport, gravarOport, CACHE_TTL_MS } from "@/lib/kingstats/store";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Quantos jogos no máximo entram no cálculo por execução. */
const MAX_JOGOS = 180;

function dayKeyDe(date: string | null): string {
  if (!date) return diaKey();
  const limpo = date.replace(/-/g, "");
  return /^\d{8}$/.test(limpo) ? limpo : diaKey();
}

/** Pega os jogos do dia do cache ou da fonte. */
async function garantirJogos(dayKey: string): Promise<Jogo[]> {
  const emCache = await lerJogos(dayKey);
  if (emCache && emCache.dados.jogos.length > 0) return emCache.dados.jogos;

  const { jogos, savedAt } = await buscarJogos(dayKey);
  if (jogos.length > 0) {
    await gravarJogos({
      dayKey,
      geradoEm: savedAt ? new Date(savedAt).toISOString() : new Date().toISOString(),
      jogos,
    });
  }
  return jogos;
}

/**
 * GET /api/kingstats/oportunidades?date=YYYY-MM-DD
 *
 * Calcula as oportunidades do dia com o modelo Poisson. É a operação CARA:
 * buscar o histórico de centenas de jogos em lotes. Por isso:
 *  - limita a MAX_JOGOS (os mais próximos de começar);
 *  - cacheia por diaKey (15 min);
 *  - se houver cache vencido mas o cálculo falhar, devolve o vencido.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const revalidate = url.searchParams.get("revalidate") === "1";
  const dayKey = dayKeyDe(url.searchParams.get("date"));

  const cache = await lerOport(dayKey);
  if (cache && !revalidate && cache.idade < CACHE_TTL_MS) {
    return NextResponse.json({
      ...cache.dados,
      dia: diaISO(dayKey),
      cached: true,
      idadeMs: cache.idade,
    });
  }

  try {
    const todos = await garantirJogos(dayKey);
    if (todos.length === 0) {
      return NextResponse.json({
        dayKey,
        dia: diaISO(dayKey),
        geradoEm: new Date().toISOString(),
        oportunidades: [],
        analisados: 0,
        cached: false,
        aviso: "a fonte não tem jogos para este dia",
      });
    }

    const agora = Math.floor(Date.now() / 1000);
    // Foco nos jogos que ainda vão acontecer (janela de 36h) e fora do esoccer.
    const candidatos = todos
      .filter((j) => !/esoccer/i.test(j.league?.name ?? ""))
      .filter((j) => {
        const t = Number(j.time);
        return Number.isFinite(t) && t > agora - 3600 && t < agora + 36 * 3600;
      })
      .sort((a, b) => Number(a.time) - Number(b.time))
      .slice(0, MAX_JOGOS);

    const alvo = candidatos.length > 0 ? candidatos : todos.filter((j) => !/esoccer/i.test(j.league?.name ?? "")).slice(0, MAX_JOGOS);

    const stats = await buscarStats(alvo);
    const oportunidades = montarOportunidades(alvo, stats);

    const payload = {
      dayKey,
      geradoEm: new Date().toISOString(),
      oportunidades,
    };
    await gravarOport(payload);

    return NextResponse.json({
      ...payload,
      dia: diaISO(dayKey),
      analisados: Object.keys(stats).length,
      cached: false,
      idadeMs: 0,
    });
  } catch (e) {
    // Falhou o cálculo: se existe cache vencido, entrega ele em vez de erro.
    if (cache) {
      return NextResponse.json({
        ...cache.dados,
        dia: diaISO(dayKey),
        cached: true,
        stale: true,
        idadeMs: cache.idade,
      });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "falha ao calcular oportunidades" },
      { status: 502 },
    );
  }
}
