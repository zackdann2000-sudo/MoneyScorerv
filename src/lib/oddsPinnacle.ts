/**
 * Âncora de odd: Pinnacle e mais ninguém.
 *
 * Por que só a Pinnacle: é a casa que aceita volume alto e por isso tem a odd
 * mais próxima da probabilidade real. Misturar a odd de uma casa menor no EV
 * produz "valor" que é só margem de mercado — o tipo de número que faz o
 * usuário apostar achando vantagem e perder.
 *
 * Regra de produto: se a Pinnacle não cotou o mercado, o mercado NÃO tem EV.
 * Não existe fallback silencioso para outra casa.
 *
 * Só banco (hub_bookmaker_odd). Nenhum fornecedor é chamado.
 */
import { db } from "@/db";
import { hubBookmakerOdd } from "@/db/hub-schema";
import { and, eq } from "drizzle-orm";
import { fixtureIdPorEspnId } from "./hub/queries";
import { MAPA_ANCORA, chaveAncora } from "./comboBuilder";

export type AncoraMapa = Record<string, number>;

/**
 * Lê as odds da Pinnacle de uma fixture da ESPN e devolve
 * `{ "BTTS|Yes": 2.05, ... }`.
 *
 * Vazio quando o jogo não está sincronizado no Hub ou quando a Pinnacle não
 * cotou. Nunca lança: rota de odds não pode derrubar a tela de mercados.
 */
export async function ancorasPinnaclePorEspnId(espnId: string): Promise<AncoraMapa> {
  try {
    const fixtureId = await fixtureIdPorEspnId(espnId);
    if (fixtureId == null) return {};

    const rows = await db
      .select({
        market: hubBookmakerOdd.market,
        selection: hubBookmakerOdd.selection,
        odds: hubBookmakerOdd.odds,
        bookmakerSlug: hubBookmakerOdd.bookmakerSlug,
        isPick: hubBookmakerOdd.isPick,
      })
      .from(hubBookmakerOdd)
      .where(eq(hubBookmakerOdd.fixtureId, fixtureId));

    const mapa: AncoraMapa = {};
    for (const r of rows) {
      const ehPinnacle = (r.bookmakerSlug || "").toLowerCase() === "pinnacle";
      if (!ehPinnacle && !r.isPick) continue;
      if (!Number.isFinite(r.odds) || r.odds <= 1.01) continue;
      // `isPick` pode apontar outra casa; o nome do arquivo é a promessa, então
      // só entra o que é Pinnacle de fato.
      if (ehPinnacle) mapa[chaveAncora(r.market, r.selection)] = r.odds;
    }
    return mapa;
  } catch {
    return {};
  }
}

/** Odd da Pinnacle para um mercado nosso (`btts`, `over25_jogo`, ...). */
export function oddAncoraDoMapa(mercadoId: string, mapa: AncoraMapa): number | null {
  const alvo = MAPA_ANCORA[mercadoId];
  if (!alvo) return null;
  const odd = mapa[chaveAncora(alvo.market, alvo.selection)];
  return Number.isFinite(odd) && odd > 1.01 ? odd : null;
}

/** Anexa `oddAncora` a cada mercado. Função pura sobre a lista. */
export function comAncoras<T extends { id: string; oddAncora?: number | null }>(mercados: T[], mapa: AncoraMapa): T[] {
  return mercados.map((m) => ({ ...m, oddAncora: oddAncoraDoMapa(m.id, mapa) }));
}
