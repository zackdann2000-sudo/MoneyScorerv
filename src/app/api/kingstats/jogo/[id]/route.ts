import { NextResponse } from "next/server";
import { buscarJogos, buscarStats, diaKey, diaISO, resumirEquipe, ultimas, type Jogo } from "@/lib/kingstats";
import { modelarJogo } from "@/lib/kingstats/modelo";
import { lerJogos, gravarJogos } from "@/lib/kingstats/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function dayKeyDe(date: string | null): string {
  if (!date) return diaKey();
  const limpo = date.replace(/-/g, "");
  return /^\d{8}$/.test(limpo) ? limpo : diaKey();
}

async function jogosDoDia(dayKey: string): Promise<Jogo[]> {
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
 * GET /api/kingstats/jogo/[id]?date=YYYY-MM-DD&n=10
 *
 * Devolve o histórico recente dos dois lados (as últimas N partidas, com
 * resultado e adversário), os resumos por mando e o modelo Poisson do jogo.
 * Busca o histórico só deste jogo — é rápido, mesmo sem cache.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const n = Math.min(Math.max(Number(url.searchParams.get("n") ?? 10), 3), 20);

  // O jogo pode estar no dia pedido ou em hoje; tentamos ambos.
  const tentativas = [dayKeyDe(url.searchParams.get("date")), diaKey()];
  let jogo: Jogo | undefined;
  let dayKeyUsado = tentativas[0];

  for (const k of tentativas) {
    const lista = await jogosDoDia(k);
    const achado = lista.find((j) => j.id === id);
    if (achado) {
      jogo = achado;
      dayKeyUsado = k;
      break;
    }
  }

  if (!jogo) {
    return NextResponse.json({ error: "jogo não encontrado neste dia" }, { status: 404 });
  }

  const stats = await buscarStats([jogo]);
  const s = stats[jogo.id];

  if (!s) {
    return NextResponse.json({
      jogo: {
        id: jogo.id,
        liga: jogo.league?.name ?? "",
        home: jogo.home?.name ?? "",
        away: jogo.away?.name ?? "",
        kickoff: jogo.time,
        dia: diaISO(dayKeyUsado),
        ss: jogo.ss ?? null,
      },
      semHistorico: true,
      modelo: null,
    });
  }

  const enxuto = (p: { id: string; d: number; h: boolean; gf: number; ga: number; o: string }) => ({
    id: p.id,
    data: p.d,
    casa: p.h,
    gf: p.gf,
    ga: p.ga,
    adversario: p.o,
    resultado: p.gf > p.ga ? "W" : p.gf === p.ga ? "D" : "L",
  });

  const casaTodas = resumirEquipe(ultimas(s.home, "all", n));
  const foraTodas = resumirEquipe(ultimas(s.away, "all", n));
  const casaComoCasa = resumirEquipe(ultimas(s.home, "home", n));
  const foraComoFora = resumirEquipe(ultimas(s.away, "away", n));

  const modelo = modelarJogo(s);

  return NextResponse.json({
    jogo: {
      id: jogo.id,
      liga: jogo.league?.name ?? "",
      home: jogo.home?.name ?? "",
      away: jogo.away?.name ?? "",
      kickoff: jogo.time,
      dia: diaISO(dayKeyUsado),
      ss: jogo.ss ?? null,
    },
    semHistorico: false,
    resumos: {
      casa: { geral: casaTodas, comoCasa: casaComoCasa },
      fora: { geral: foraTodas, comoFora: foraComoFora },
    },
    ultimas: {
      casa: ultimas(s.home, "all", n).map(enxuto),
      fora: ultimas(s.away, "all", n).map(enxuto),
    },
    modelo,
  });
}
