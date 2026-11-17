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

/**
 * Achata o jogo cru da fonte (league/home/away são objetos) para o formato que
 * a UI consome. Toda resposta passa por aqui — ver o comentário no GET sobre o
 * bug que existia quando o caminho de cache pulava esta função.
 */
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
 *
 * HISTÓRICO DE UM BUG: antes existia um `return` antecipado no caminho de cache
 * que devolvia `...emCache.dados` — e o cache guarda os jogos CRUS da fonte.
 * Resultado: a primeira requisição (sem cache) devolvia o formato correto e
 * funcionava; da segunda em diante o cache respondia com objetos aninhados
 * (`home`, `away`, `league`), o React tentava renderizar um objeto como filho e
 * a página inteira caía em "This page couldn't load". Agora o mapeamento é
 * aplicado SEMPRE, inclusive na leitura do cache — o cache antigo (cru) também
 * passa a funcionar sem precisar ser limpo.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const pediuData = url.searchParams.get("date");
  const revalidate = url.searchParams.get("revalidate") === "1";

  const dayKeyInicial = dayKeyDe(pediuData);

  let usados: Jogo[] = [];
  let dayKeyFinal = dayKeyInicial;
  let geradoEm = new Date().toISOString();
  let cached = false;
  let idadeMs = 0;

  const emCache = await lerJogos(dayKeyInicial);
  const cacheValido =
    emCache && !revalidate && emCache.idade < CACHE_TTL_MS && emCache.dados.jogos.length > 0;

  if (cacheValido) {
    usados = emCache.dados.jogos; // crus — mapeados logo abaixo
    geradoEm = emCache.dados.geradoEm;
    cached = true;
    idadeMs = emCache.idade;
  } else {
    const { jogos, savedAt } = await buscarJogos(dayKeyInicial);
    usados = jogos;

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

    geradoEm = savedAt ? new Date(savedAt).toISOString() : new Date().toISOString();
    if (usados.length > 0) {
      await gravarJogos({ dayKey: dayKeyFinal, geradoEm, jogos: usados });
    }
  }

  const dia = diaISO(dayKeyFinal);
  const lista = usados.map((j) => paraUI(j, dia));
  const ligas = [...new Set(lista.filter((j) => !j.esoccer).map((j) => j.liga))].sort();

  return NextResponse.json({
    dayKey: dayKeyFinal,
    dia,
    geradoEm,
    total: lista.length,
    ligas,
    jogos: lista,
    cached,
    idadeMs,
  });
}
