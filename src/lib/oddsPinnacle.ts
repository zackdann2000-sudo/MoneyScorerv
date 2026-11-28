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
import type { OddsMercado } from "./valueBet";

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

/* ============ VALUE BET (opportunitiesEngine) — SÓ ÂNCORA ============ */

/**
 * Mercado do Value Bet (`valueBet.ts`) → mercado/seleção gravados no Hub.
 *
 * As chaves são as do motor de valor (`home`, `over25`...), não as de
 * `MAPA_ANCORA` (que fala a língua de `mercadosPoisson`). São dois vocabulários
 * diferentes para o mesmo `hub_bookmaker_odd`; manter separado evita que um
 * rename de mercado num lado quebre o outro.
 *
 * Os nomes de mercado/seleção são EXATAMENTE os que `sportmonks.ts` grava
 * (`SM_MARKET_LABEL` + `smSelection`): "1X2" com Home/Draw/Away, "BTTS" com
 * Yes/No e "Over/Under" com "Over 2.5"/"Under 2.5".
 */
export const MAPA_ANCORA_VALOR: Record<string, { market: string; selection: string }> = {
  home: { market: "1X2", selection: "Home" },
  draw: { market: "1X2", selection: "Draw" },
  away: { market: "1X2", selection: "Away" },
  over25: { market: "Over/Under", selection: "Over 2.5" },
  under25: { market: "Over/Under", selection: "Under 2.5" },
  btts: { market: "BTTS", selection: "Yes" },
};

/**
 * Odds de mercado do Value Bet montadas SÓ com as âncoras da Pinnacle.
 *
 * Regra inegociável do produto: um mercado sem cotação da Pinnacle **não tem
 * EV**. Por isso não existe fallback para ESPN/API-Football: o campo que falta
 * na âncora simplesmente não entra no objeto e o núcleo (`avaliarOportunidades`)
 * nunca cria candidato para ele — logo não há `valor`, `evPct` nem `stake`
 * calculados sobre preço de casa menor.
 *
 * `null` = a Pinnacle não cotou nenhum dos mercados do jogo (jogo fora do Hub,
 * odd ainda não sincronizada). Quem chama trata como "sem valor", não como zero.
 */
export function oddsDoValueBet(mapa: AncoraMapa): OddsMercado | null {
  const preco = (id: string): number | null => {
    const alvo = MAPA_ANCORA_VALOR[id];
    if (!alvo) return null;
    const odd = mapa[chaveAncora(alvo.market, alvo.selection)];
    return Number.isFinite(odd) && odd > 1.01 ? odd : null;
  };

  const home = preco("home");
  const draw = preco("draw");
  const away = preco("away");
  const over = preco("over25");
  const under = preco("under25");
  const btts = preco("btts");

  if ([home, draw, away, over, under, btts].every((v) => v == null)) return null;

  return {
    home,
    draw,
    away,
    over,
    under,
    /* A linha é fixa por definição do mapa: over25/under25 são a linha 2.5.
       Sem `ou` o núcleo não distingue a linha e cruza prob de 2.5 com odd de
       outra linha — por isso ela só aparece quando existe odd desses dois. */
    ou: over != null || under != null ? 2.5 : null,
    btts,
    provider: "Pinnacle",
  };
}
