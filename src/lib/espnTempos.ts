/* =======================================================================
   ESPN — recorte de 1º/2º tempo (camada pura, sem rede).
   -----------------------------------------------------------------------
   Por que existe: o SportMonks entrega `periods.statistics` (métricas por
   tempo), mas o plano em uso só cobre a Premiership escocesa — jogo do
   Brasileirão não aparece e o split nunca chega. O ESPN, que o app já busca
   para abrir a tela de estatísticas, publica o recorte SEM chave e SEM cota:

     header.competitions[0].competitors[].linescores
       → placar de cada tempo (valor do período 1 = 1º tempo, 2 = 2º tempo);
     keyEvents[].period.number + type.text
       → cada cartão/gol com o tempo em que aconteceu.

   O que este módulo NÃO faz: inventar finalização/posse por tempo. Essas
   métricas só existem como total do jogo no ESPN, então ficam de fora do
   split em vez de aparecerem repetidas ou divididas "no olho".
   ======================================================================= */

import type { MetricaTempo } from "./smTempos";

export type SplitEspn = {
  primeiroTempo: MetricaTempo[];
  segundoTempo: MetricaTempo[];
};

/** Número a partir do que o ESPN manda (string "2", number 2). */
function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const vazio = (): SplitEspn => ({ primeiroTempo: [], segundoTempo: [] });

/**
 * Lados do jogo a partir do header: { home: competitorId, away: competitorId }.
 * Usa `homeAway`; se faltar, cai na ordem do array (home primeiro).
 */
export function ladosDoHeader(summary: any): { home: string; away: string } {
  const comp = summary?.header?.competitions?.[0];
  const competidores: any[] = comp?.competitors || [];
  const porLado = (lado: string) => competidores.find((c) => String(c?.homeAway ?? "").toLowerCase() === lado);
  const home = porLado("home") || competidores[0];
  const away = porLado("away") || competidores[1];
  return { home: String(home?.id ?? home?.team?.id ?? ""), away: String(away?.id ?? away?.team?.id ?? "") };
}

/**
 * Gols por tempo pelas `linescores`.
 *
 * ATENÇÃO ao formato real do ESPN: a lista NÃO traz `period`; a ordem é que
 * diz o tempo (índice 0 = 1º tempo, 1 = 2º tempo). Quando `period` existe,
 * ele manda. Foi assim que o split de Chapecoense x Palmeiras sumiu na
 * primeira versão: o parser procurava `period` e não achava nada.
 */
export function golsPorTempoEspn(summary: any): SplitEspn {
  const comp = summary?.header?.competitions?.[0];
  const competidores: any[] = comp?.competitors || [];
  if (!competidores.length) return vazio();

  const lado = (c: any) => String(c?.homeAway ?? "").toLowerCase();
  const home = competidores.find((c) => lado(c) === "home") || competidores[0];
  const away = competidores.find((c) => lado(c) === "away") || competidores[1];

  const porPeriodo = (c: any, periodo: number): number | null => {
    const lista: any[] = c?.linescores || [];
    const porCampo = lista.find((x: any) => Number(x?.period) === periodo);
    const alvo = porCampo ?? lista[periodo - 1];
    return num(alvo?.value ?? alvo?.displayValue);
  };

  const montar = (periodo: number): MetricaTempo[] => {
    const h = porPeriodo(home, periodo);
    const a = porPeriodo(away, periodo);
    /* Sem nenhum dos dois lados o período não foi publicado: fora. */
    if (h == null && a == null) return [];
    return [{ key: "goals", label: "Gols", home: h ?? 0, away: a ?? 0 }];
  };

  return { primeiroTempo: montar(1), segundoTempo: montar(2) };
}

/**
 * Cartões por tempo a partir dos `keyEvents` (cada evento traz o período).
 * `team.id` do evento é comparado com o id do competidor.
 */
export function cartoesPorTempoEspn(summary: any): SplitEspn {
  const eventos: any[] = summary?.keyEvents || summary?.events || [];
  if (!eventos.length) return vazio();

  const { home, away } = ladosDoHeader(summary);

  const conta = (periodo: number, tipo: "yellow" | "red") => {
    const r = { home: 0, away: 0 };
    let achou = false;
    for (const e of eventos) {
      if (Number(e?.period?.number) !== periodo) continue;
      const texto = String(e?.type?.text ?? e?.type?.name ?? "").toLowerCase();
      if (!texto.includes("card")) continue;
      const ehVermelho = texto.includes("red");
      if (tipo === "red" ? !ehVermelho : ehVermelho || !texto.includes("yellow")) continue;
      const timeId = String(e?.team?.id ?? "");
      if (timeId && timeId === home) r.home++;
      else if (timeId && timeId === away) r.away++;
      else continue;
      achou = true;
    }
    return achou ? r : null;
  };

  const montar = (periodo: number): MetricaTempo[] => {
    const out: MetricaTempo[] = [];
    const amarelos = conta(periodo, "yellow");
    if (amarelos) out.push({ key: "yellow_cards", label: "Cartões amarelos", home: amarelos.home, away: amarelos.away });
    const vermelhos = conta(periodo, "red");
    if (vermelhos) out.push({ key: "red_cards", label: "Cartões vermelhos", home: vermelhos.home, away: vermelhos.away });
    return out;
  };

  return { primeiroTempo: montar(1), segundoTempo: montar(2) };
}

/**
 * Split completo do ESPN: gols (linescores) + cartões (keyEvents).
 * Jogo que ainda não começou devolve vazio — não existe 1º tempo para mostrar.
 */
export function splitDoEspn(summary: any): SplitEspn {
  const comp = summary?.header?.competitions?.[0];
  const estado = String(comp?.status?.type?.state ?? "").toLowerCase();
  if (estado === "pre") return vazio();

  const gols = golsPorTempoEspn(summary);
  const cartoes = cartoesPorTempoEspn(summary);

  const juntar = (a: MetricaTempo[], b: MetricaTempo[]): MetricaTempo[] => {
    const mapa = new Map<string, MetricaTempo>();
    for (const m of [...a, ...b]) mapa.set(m.key, m);
    /* Gols primeiro, depois cartões — mesma ordem do SportMonks. */
    return [...mapa.values()].sort((x, y) => (x.key === "goals" ? -1 : y.key === "goals" ? 1 : 0));
  };

  return {
    primeiroTempo: juntar(gols.primeiroTempo, cartoes.primeiroTempo),
    segundoTempo: juntar(gols.segundoTempo, cartoes.segundoTempo),
  };
}
