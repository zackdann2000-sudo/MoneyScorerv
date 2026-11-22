/**
 * FATORES DE xG (DumbleScore) — leitura pura do que o motor já gravou.
 *
 * O `runHubModel` aplica um ajuste multiplicativo no xG de cada lado
 * (`factorShift`) somando `impact × weight` de cada fator. Aqui não recalculamos
 * nada: apenas traduzimos a mesma conta para pontos percentuais e para texto,
 * em cima das linhas de `hub_xg_factor` da última análise publicada.
 *
 * Regra da casa: fator sem número não vira frase. Se o peso é zero ou o impacto
 * é nulo, o item não aparece; se não sobra nenhum fator, a UI mostra
 * "Dados indisponíveis" em vez de inventar um motivo.
 *
 * Este módulo é puro (sem db, sem fetch) para poder ser testado sozinho.
 */

export type FatorXgBruto = {
  side: string;
  factorType: string;
  impact: number;
  weight: number;
  context?: Record<string, unknown> | null;
};

export type FatorXgView = {
  tipo: string;
  rotulo: string;
  /** Deslocamento no xG em pontos percentuais (positivo = aumenta o xG). */
  pct: number;
  tom: "pos" | "neg" | "neutro";
  detalhe: string | null;
  peso: number;
};

export type FatoresDoLado = {
  lado: "Home" | "Away";
  itens: FatorXgView[];
  /** Ajuste total aplicado ao xG do lado, em % (o motor trava em ±25%). */
  ajustePct: number | null;
};

/** Rótulo humano de cada `factorType` do motor. */
export const ROTULOS_FATOR: Record<string, string> = {
  StrongRecentForm: "Forma recente em alta",
  WeakRecentForm: "Forma recente em queda",
  HighScoringStreak: "Sequência goleadora",
  LowScoringStreak: "Sequência sem gols",
  CleanSheetStreak: "Sequência sem sofrer gol",
  StrongDefense: "Defesa sólida",
  WeakDefense: "Defesa vazada",
  StrongAttackRating: "Ataque acima da média",
  WeakAttackRating: "Ataque abaixo da média",
  SmallSampleRegression: "Amostra pequena (regressão à média)",
  HighScoringLeague: "Liga goleadora",
  LowScoringLeague: "Liga de poucos gols",
  StandingsAdvantage: "Vantagem na tabela",
  StandingsDisadvantage: "Desvantagem na tabela",
  SignificantSquadWeakening: "Desfalques relevantes",
  FullStrengthSquad: "Time completo",
  MissingKeyPlayerBench: "Craque começa no banco",
  MissingKeyPlayerAbsent: "Craque desfalcado",
  LineupAdjustment: "Ajuste de escalação",
};

const num = (v: unknown): number | null => {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

const fmt = (v: unknown, casas = 2): string | null => {
  const x = num(v);
  return x == null ? null : x.toFixed(casas);
};

/** Texto curto com os números que sustentam o fator (só o que existe no contexto). */
function detalheDoFator(tipo: string, ctx: Record<string, unknown> | null | undefined): string | null {
  if (!ctx) return null;
  switch (tipo) {
    case "StrongRecentForm":
    case "WeakRecentForm": {
      const recente = fmt(ctx.recentAvg);
      const amostra = fmt(ctx.seasonAvg);
      if (recente == null) return null;
      return amostra
        ? `${recente} gols/jogo nos últimos 5 · ${amostra} na amostra inteira`
        : `${recente} gols/jogo nos últimos 5`;
    }
    case "HighScoringStreak":
    case "LowScoringStreak":
    case "CleanSheetStreak": {
      const sequencia = num(ctx.streak);
      if (sequencia == null) return null;
      return `${sequencia} dos últimos 5 jogos`;
    }
    case "StrongDefense":
    case "WeakDefense": {
      const sofridos = fmt(ctx.concededAvg);
      const liga = fmt(ctx.leagueAvg);
      if (sofridos == null) return null;
      return liga ? `sofre ${sofridos}/jogo · média da liga ${liga}` : `sofre ${sofridos}/jogo`;
    }
    case "StrongAttackRating":
    case "WeakAttackRating": {
      const rating = fmt(ctx.rating);
      return rating ? `${rating}× a média de gols da liga` : null;
    }
    case "HighScoringLeague":
    case "LowScoringLeague": {
      const total = fmt(ctx.leagueAvgTotal);
      return total ? `teto de gols da liga: ${total} por jogo` : null;
    }
    case "StandingsAdvantage":
    case "StandingsDisadvantage": {
      const pos = num(ctx.position);
      const adv = num(ctx.opponentPosition);
      if (pos == null || adv == null) return null;
      return `${pos}º na tabela · adversário ${adv}º`;
    }
    case "SignificantSquadWeakening": {
      const fora = num(ctx.missingPct);
      return fora == null ? null : `${fora}% da produção do elenco fora do XI`;
    }
    case "FullStrengthSquad": {
      const ativa = num(ctx.activeShare);
      return ativa == null ? null : `${ativa}% da produção do elenco em campo`;
    }
    case "MissingKeyPlayerBench":
    case "MissingKeyPlayerAbsent": {
      const nome = typeof ctx.playerName === "string" ? ctx.playerName : null;
      if (!nome) return null;
      const gols = num(ctx.goals) ?? 0;
      const assist = num(ctx.assists) ?? 0;
      const onde = ctx.status === "bench" ? "no banco" : "fora do jogo";
      return `${nome} ${onde} · ${gols} gol(s) e ${assist} assistência(s) na temporada`;
    }
    default:
      return null;
  }
}

const arred = (v: number, casas = 1) => Number(v.toFixed(casas));

/**
 * Converte as linhas de um lado em itens de tela.
 *
 * `factorShift` divide o impacto ponderado pela soma de pesos do lado — então
 * a fatia de cada fator no deslocamento do xG é exatamente
 * `impact × weight / max(1, Σ pesos)`. É a mesma fórmula, em porcentagem.
 */
export function fatoresPorLado(fatores: FatorXgBruto[] | null | undefined, lado: "Home" | "Away"): FatoresDoLado {
  const doLado = (fatores ?? []).filter((f) => f.side === lado);
  if (!doLado.length) return { lado, itens: [], ajustePct: null };

  const pesoTotal = Math.max(1, doLado.reduce((s, f) => s + (num(f.weight) ?? 0), 0));

  const itens: FatorXgView[] = doLado
    .map((f) => {
      const peso = num(f.weight) ?? 0;
      const impacto = num(f.impact) ?? 0;
      const pct = arred(((impacto * peso) / pesoTotal) * 100);
      const tom: FatorXgView["tom"] = pct > 0.2 ? "pos" : pct < -0.2 ? "neg" : "neutro";
      return {
        tipo: f.factorType,
        rotulo: ROTULOS_FATOR[f.factorType] ?? f.factorType,
        pct,
        tom,
        detalhe: detalheDoFator(f.factorType, f.context),
        peso: arred(peso, 2),
      };
    })
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));

  // Fator que não move o xG (impacto 0) só entra se não houver mais nada a
  // mostrar — senão vira ruído no bloco.
  const comImpacto = itens.filter((i) => i.pct !== 0);
  const exibidos = (comImpacto.length ? comImpacto : itens).slice(0, 5);

  const soma = itens.reduce((s, i) => s + i.pct, 0);
  const ajustePct = arred(Math.min(25, Math.max(-25, soma)));

  return { lado, itens: exibidos, ajustePct };
}

/** Texto do selo de ajuste ("+4.2% no xG" · "sem ajuste"). */
export function seloAjuste(ajustePct: number | null): string {
  if (ajustePct == null) return "sem ajuste";
  if (Math.abs(ajustePct) < 0.05) return "sem ajuste";
  return `${ajustePct > 0 ? "+" : ""}${ajustePct.toFixed(1)}% no xG`;
}
