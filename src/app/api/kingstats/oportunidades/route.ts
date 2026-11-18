import { NextRequest, NextResponse, after } from "next/server";
import { buscarJogos, buscarStats, diaKey, diaISO, type Jogo } from "@/lib/kingstats";
import { montarOportunidades } from "@/lib/kingstats/modelo";
import { lerJogos, gravarJogos, lerOport, gravarOport, CACHE_TTL_MS, type PayloadOport } from "@/lib/kingstats/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Quantos jogos no máximo entram no cálculo por execução. */
const MAX_JOGOS = 180;

/**
 * Orçamento de tempo do cálculo. O teto da função é 60s; paramos antes para
 * ainda ter tempo de gravar o cache e responder. Se o prazo cortar o meio da
 * varredura, entregamos as oportunidades já calculadas e marcamos `parcial`.
 */
const ORCAMENTO_MS = 42_000;

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

/** Cálculo caro: histórico de cada jogo + modelo Poisson. Grava o cache. */
async function calcular(dayKey: string): Promise<PayloadOport> {
  const todos = await garantirJogos(dayKey);

  if (todos.length === 0) {
    return {
      dayKey,
      geradoEm: new Date().toISOString(),
      analisados: 0,
      parcial: false,
      oportunidades: [],
      aviso: "a fonte não tem jogos para este dia",
    };
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

  const alvo =
    candidatos.length > 0
      ? candidatos
      : todos.filter((j) => !/esoccer/i.test(j.league?.name ?? "")).slice(0, MAX_JOGOS);

  const stats = await buscarStats(alvo, 4, ORCAMENTO_MS);
  const oportunidades = montarOportunidades(alvo, stats);
  const analisados = Object.keys(stats).length;

  const payload = {
    dayKey,
    geradoEm: new Date().toISOString(),
    analisados,
    /* Nem todo jogo do alvo entrou: ou a fonte não tem histórico dele, ou o
       orçamento de tempo cortou a varredura. A UI usa isso para avisar. */
    parcial: analisados < alvo.length,
    oportunidades,
  };

  await gravarOport(payload);
  return payload;
}

/**
 * GET /api/kingstats/oportunidades?date=YYYY-MM-DD
 *
 * Calcula as oportunidades do dia com o modelo Poisson. É a operação CARA:
 * buscar o histórico de centenas de jogos em lotes. Ordem de serviço:
 *
 *  1. cache fresco (15 min) → responde na hora;
 *  2. cache vencido → responde o vencido NA HORA (stale) e recalcula em segundo
 *     plano com `after()`. Antes o usuário ficava 40s olhando o spinner só
 *     porque o cache tinha 16 minutos;
 *  3. sem cache (primeira visita do dia) ou `revalidate=1` → calcula agora,
 *     dentro do orçamento de tempo.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const revalidate = url.searchParams.get("revalidate") === "1";
  const dayKey = dayKeyDe(url.searchParams.get("date"));

  const cache = await lerOport(dayKey);

  /* 1) fresco */
  if (cache && !revalidate && cache.idade < CACHE_TTL_MS) {
    return NextResponse.json({
      ...cache.dados,
      dia: diaISO(dayKey),
      cached: true,
      idadeMs: cache.idade,
    });
  }

  /* 2) vencido: entrega já e revalida em segundo plano */
  if (cache && !revalidate) {
    after(async () => {
      try {
        await calcular(dayKey);
      } catch (e) {
        /* Falha na revalidação não invalida o cache vencido. */
        console.error("[kingstats] revalidação falhou:", e instanceof Error ? e.message : e);
      }
    });
    return NextResponse.json({
      ...cache.dados,
      dia: diaISO(dayKey),
      cached: true,
      stale: true,
      idadeMs: cache.idade,
    });
  }

  /* 3) cálculo na hora */
  try {
    const payload = await calcular(dayKey);
    return NextResponse.json({
      ...payload,
      dia: diaISO(dayKey),
      cached: false,
      idadeMs: 0,
    });
  } catch (e) {
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
