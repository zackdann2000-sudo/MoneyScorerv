/**
 * AI REPORT — o resumo em linguagem natural do jogo (DumbleScore).
 *
 * Transforma o que o motor JÁ calculou (1X2, gols esperados, xG, H2H, forma
 * recente, padrões e Value Bet) em um texto corrido de jornalista.
 *
 * Regras que este módulo respeita:
 *  - nenhuma frase aparece sem o número que a sustenta: campo ausente = frase
 *    ausente, nunca "provavelmente" ou número inventado;
 *  - o Value Bet é citado com a odd e o EV reais, e a casa só é nomeada quando
 *    ela está no comparativo multi-casa (Pinnacle quando cotou);
 *  - jogo de demonstração não gera relatório (`demo: true` → `null`), porque os
 *    números ali são de exemplo.
 *
 * Módulo puro (sem db, sem fetch, sem React).
 */

export type EntradaRelatorio = {
  home: string;
  away: string;
  /** Massa de demonstração: os números são fictícios, então não há relatório. */
  demo?: boolean;
  probabilities?: { home: number; draw: number; away: number } | null;
  expectedGoals?: number | null;
  xg?: { home: number; away: number } | null;
  xgSource?: "real" | "estimado" | null;
  markets?: Array<{ market: string; selection: string; probability: number }>;
  topScores?: Array<{ home: number; away: number; probability: number }>;
  value?: { market: string; selection: string; probability: number; odds: number; value: number } | null;
  hasOdds?: boolean;
  h2h?: {
    matches: number;
    homeWins: number;
    draws: number;
    awayWins: number;
    avgTotalGoals: number | null;
  } | null;
  forma?: { home: string; away: string } | null;
  confidence?: number | null;
  riskFactors?: string[];
  /** Comparativo multi-casa, só para nomear a casa do preço citado. */
  oddsMultiCasa?: Array<{
    market: string;
    selection: string;
    casas: Array<{ casa: string; slug: string; odd: number }>;
    melhor: { casa: string; slug: string; odd: number } | null;
  }>;
};

export type RelatorioIA = {
  manchete: string;
  paragrafos: string[];
};

const pct = (v: number) => `${Math.round(v * 100)}%`;
const num2 = (v: number) => v.toFixed(2);

/** "V-E-D" → "V-E-D" (mantém a ordem: mais recente primeiro). */
const formaTexto = (s: string) => s.split("").filter((c) => "VED".includes(c)).join("-");

function nomeSelecao(market: string, selection: string, home: string, away: string): string {
  if (market === "1X2") return selection === "Home" ? `vitória do ${home}` : selection === "Away" ? `vitória do ${away}` : "empate";
  if (market === "BTTS") return selection === "Yes" ? "ambas marcam" : "uma equipe sem marcar";
  if (market === "Over/Under") return `${selection.toLowerCase()} gols`;
  if (market === "DoubleChance") {
    if (selection === "HomeOrDraw") return `${home} ou empate`;
    if (selection === "AwayOrDraw") return `${away} ou empate`;
    if (selection === "HomeOrAway") return "qualquer vitória";
  }
  return selection;
}

/** Casa que sustenta a odd citada no Value Bet (Pinnacle quando cotou). */
function casaDoValor(
  value: { market: string; selection: string; odds: number },
  comparativos: EntradaRelatorio["oddsMultiCasa"],
): { casa: string; odd: number } | null {
  const linha = comparativos?.find((c) => c.market === value.market && c.selection === value.selection);
  if (!linha) return null;
  const pinnacle = linha.casas.find((c) => c.slug === "pinnacle");
  if (pinnacle) return { casa: "Pinnacle", odd: pinnacle.odd };
  return linha.melhor ? { casa: linha.melhor.casa, odd: linha.melhor.odd } : null;
}

/**
 * Gera manchete + parágrafos. Devolve `null` quando não há nada de real para
 * dizer (sem probabilidade, sem gols esperados e sem xG).
 */
export function gerarRelatorio(e: EntradaRelatorio): RelatorioIA | null {
  if (e.demo) return null;

  const p = e.probabilities ?? null;
  const temGols = e.expectedGoals != null || (e.markets?.length ?? 0) > 0;
  const temXg = e.xg != null;
  if (!p && !temGols && !temXg) return null;

  const home = e.home;
  const away = e.away;
  const over25 = e.markets?.find((m) => m.market === "Over/Under" && m.selection === "Over 2.5")?.probability ?? null;
  const btts = e.markets?.find((m) => m.market === "BTTS" && m.selection === "Yes")?.probability ?? null;

  /* ---------------------------- parágrafo 1: favorito ---------------------------- */
  const lead: string[] = [];
  let favorito: string | null = null;

  if (p) {
    const maior = Math.max(p.home, p.draw, p.away);
    if (maior === p.draw) {
      lead.push(
        `O modelo não elege favorito: ${pct(p.draw)} de empate, ${pct(p.home)} para o ${home} e ${pct(p.away)} para o ${away}.`,
      );
    } else {
      favorito = maior === p.home ? home : away;
      const grau = maior >= 0.68 ? "favoritismo forte" : maior >= 0.58 ? "favoritismo claro" : maior >= 0.48 ? "leve vantagem" : "vantagem mínima";
      const dono = maior === p.home ? `o ${home}` : `o ${away}`;
      lead.push(
        `O modelo aponta ${grau} para ${dono}: ${pct(maior)} de vitória, contra ${pct(maior === p.home ? p.away : p.home)} do adversário e ${pct(p.draw)} de empate.`,
      );
    }
  }

  const topScore = e.topScores?.[0];
  if (topScore) {
    lead.push(
      `O placar mais provável é ${topScore.home}-${topScore.away}, com ${(topScore.probability * 100).toFixed(1)}% na matriz de Poisson.`,
    );
  }

  /* ---------------------------- parágrafo 2: gols e xG ---------------------------- */
  const gols: string[] = [];

  if (e.expectedGoals != null || over25 != null || btts != null) {
    const partes: string[] = [];
    if (e.expectedGoals != null) partes.push(`${num2(e.expectedGoals)} gols no total`);
    if (over25 != null) partes.push(`Over 2.5 em ${pct(over25)}`);
    if (btts != null) partes.push(`ambas marcam em ${pct(btts)}`);
    gols.push(`Na leitura de gols, o modelo projeta ${partes.join(", ")}.`);

    if (over25 != null) {
      const tendencia =
        over25 >= 0.58 ? "um jogo aberto, com espaço para gols dos dois lados" : over25 <= 0.42 ? "um jogo travado, de poucos gols" : "um jogo de ritmo médio";
      gols.push(`O cenário aponta ${tendencia}.`);
    }
  }

  if (e.xg) {
    const fonte =
      e.xgSource === "real" ? "xG publicado pelo fornecedor" : e.xgSource === "estimado" ? "xG estimado pelo modelo a partir de finalizações" : "xG";
    gols.push(`O ${fonte} é de ${num2(e.xg.home)} para o ${home} e ${num2(e.xg.away)} para o ${away}.`);
  }

  const h2h = e.h2h;
  if (h2h && h2h.matches >= 3) {
    const media = h2h.avgTotalGoals;
    const leitura =
      media == null ? "" : media >= 2.7 ? " — número que confirma o cenário de gols" : media <= 2.2 ? " — número que puxa a expectativa para baixo" : "";
    gols.push(
      `No confronto direto de ${h2h.matches} jogos, são ${h2h.homeWins} vitórias do ${home}, ${h2h.draws} empates e ${h2h.awayWins} do ${away}${
        media != null ? `, com média de ${num2(media)} gols por jogo` : ""
      }${leitura}.`,
    );
  }

  /* ------------------- parágrafo 3: forma, valor e confiança ------------------- */
  const valor: string[] = [];

  if (e.forma) {
    const fh = formaTexto(e.forma.home);
    const fa = formaTexto(e.forma.away);
    if (fh || fa) {
      valor.push(
        `A forma recente traz o ${home}${fh ? ` em ${fh}` : " sem sequência registrada"} e o ${away}${fa ? ` em ${fa}` : " sem sequência registrada"} (mais recente primeiro).`,
      );
    }
  }

  if (e.hasOdds && e.value) {
    const selecao = nomeSelecao(e.value.market, e.value.selection, home, away);
    const casa = casaDoValor(e.value, e.oddsMultiCasa);
    const preco = casa ? ` @${num2(casa.odd)} na ${casa.casa}` : "";
    valor.push(
      `O Value Bet do modelo é ${selecao}${preco}: ${pct(e.value.probability)} de probabilidade contra ${num2(e.value.odds)} de odd, o que dá EV de +${(e.value.value * 100).toFixed(1)}%.`,
    );
  } else if (e.hasOdds === false) {
    valor.push("Sem odd publicada para este jogo, o relatório fica na probabilidade: não há EV a calcular.");
  }

  if (e.confidence != null) {
    valor.push(`A confiança do modelo nesta análise é de ${Math.round(e.confidence)}%.`);
  }

  const risco = e.riskFactors?.find((r) => r.trim().length > 0);
  if (risco) {
    const limpo = risco.replace(/\s+/g, " ").trim();
    valor.push(`Ponto de atenção: ${/[.!?]$/.test(limpo) ? limpo : `${limpo}.`}`);
  }

  /* --------------------------------- manchete --------------------------------- */
  const totalGols = e.expectedGoals;
  const manchete =
    over25 != null && over25 >= 0.58
      ? `Jogo aberto: ${home} x ${away}${totalGols != null ? ` com ${num2(totalGols)} gols esperados` : ""}`
      : over25 != null && over25 <= 0.42
        ? `Jogo fechado: ${home} x ${away}${totalGols != null ? ` com ${num2(totalGols)} gols esperados` : ""}`
        : favorito
          ? `${favorito} na frente em ${home} x ${away}`
          : `${home} x ${away}: equilíbrio no modelo`;

  const paragrafos = [lead.join(" "), gols.join(" "), valor.join(" ")].filter((t) => t.trim().length > 0);
  if (!paragrafos.length) return null;

  return { manchete, paragrafos };
}
