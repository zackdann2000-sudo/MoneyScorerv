/**
 * PADRÕES ESTATÍSTICOS (DumbleScore / "The Lab") — leitura do cache.
 *
 * Os padrões já vêm prontos da análise (`hub_analysis.lab_insights`), gerados
 * pelo `buildLabInsights` em cima dos últimos jogos dos dois times. Aqui só
 * ordenamos, rotulamos e dizemos com honestidade o que é padrão temporal
 * (depende do minuto do lance) e o que não é.
 *
 * `IntervalDominance` é o único padrão que depende de `goalMinutes`. Quando o
 * cache não tem minuto de gol, esse padrão simplesmente não existe — e a tela
 * avisa "Dados indisponíveis" em vez de chutar "marca nos primeiros 15 min".
 *
 * Módulo puro (sem db, sem fetch).
 */

export type InsightCache = {
  patternType: string;
  solidityScore: number;
  teamName: string;
  text: string;
  rank?: number;
};

export type PadraoView = {
  tipo: string;
  rotulo: string;
  time: string;
  texto: string;
  /** Solidez do padrão em % (0–95). */
  solidez: number;
  /** true = depende do minuto do lance (gol/cartão). */
  temporal: boolean;
};

export type PadroesVisiveis = {
  itens: PadraoView[];
  /** Quantos dos padrões exibidos usam o minuto do lance. */
  temporais: number;
  /** true quando existe pelo menos um padrão real para mostrar. */
  disponivel: boolean;
  aviso: string | null;
};

export const ROTULOS_PADRAO: Record<string, string> = {
  EfficiencyPattern: "Eficiência",
  IntervalDominance: "Intervalo de jogo",
  FirstGoalPattern: "Marca sempre",
};

/** Padrões que só existem com o minuto do lance no cache. */
export const PADROES_TEMPORAIS = new Set(["IntervalDominance"]);

const AVISO_SEM_PADRAO =
  "Dados indisponíveis: a análise deste jogo não gerou padrões com base suficiente. Preferimos não inventar tendência.";

export function padroesDoCache(insights: InsightCache[] | null | undefined): PadroesVisiveis {
  const lista = Array.isArray(insights) ? insights : [];
  const itens: PadraoView[] = lista
    .filter((i) => i && typeof i.text === "string" && i.text.trim().length > 0)
    .map((i) => ({
      tipo: String(i.patternType ?? ""),
      rotulo: ROTULOS_PADRAO[String(i.patternType ?? "")] ?? "Padrão",
      time: String(i.teamName ?? ""),
      texto: i.text.trim(),
      solidez: Math.round(Math.min(95, Math.max(0, Number(i.solidityScore) || 0)) * 100),
      temporal: PADROES_TEMPORAIS.has(String(i.patternType ?? "")),
    }))
    .sort((a, b) => b.solidez - a.solidez || a.time.localeCompare(b.time))
    .slice(0, 6);

  return {
    itens,
    temporais: itens.filter((i) => i.temporal).length,
    disponivel: itens.length > 0,
    aviso: itens.length ? null : AVISO_SEM_PADRAO,
  };
}

/** Nota de rodapé sobre os padrões por minuto. */
export function notaTemporal(temporais: number): string {
  return temporais > 0
    ? "Padrões por intervalo usam o minuto real dos gols nos últimos jogos."
    : "Padrões por minuto (gols/cartões por intervalo) exigem o minuto do lance no cache — dados indisponíveis para este jogo.";
}
