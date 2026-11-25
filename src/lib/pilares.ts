/**
 * Pilares decompostos — abrir a conta do modelo para o usuário.
 *
 * Módulo PURO: sem rede, sem banco. Recebe o que `runModel` (`@/lib/model`) e o
 * Veredito já devolveram e devolve os mesmos números, só que separados.
 *
 * ## Regra que não muda
 *
 * Só aparece pilar com dado real. Sem base → `nota: null`, e a UI não desenha
 * barra. Nunca preenchemos com média de liga nem com "0" cosmético.
 *
 * ## O que significa `peso`
 *
 * O λ de cada lado é multiplicativo:
 *
 *     λ_casa = leagueHalf × ataque(casa) × defesa(visitante) × mando
 *     λ_fora = leagueHalf × ataque(fora) × defesa(casa)   × mando
 *
 * Como é produto, a contribuição justa de um fator é a fatia do desvio
 * logarítmico: `|ln fator| ÷ Σ|ln fator|`. Fator 1,00 = neutro, não moveu nada.
 *
 * Como o mercado do Veredito é sempre de **total** (Over 1.5/2.5, Under 3.5,
 * ambas marcam), os dois lados entram com o mesmo peso — por isso a média
 * geométrica dos fatores de casa e fora. É por isso que o mando aparece com
 * ×1,04 no total do jogo mesmo sendo ×1,18 na casa: no total, os dois lados
 * quase se anulam. Isso é o modelo, não um erro de arredondamento.
 *
 * ## Hit rate e Value
 *
 * Nenhum dos dois entra no λ — são leitura de apoio. Saem com `peso: null`
 * para deixar explícito: o número existe, o peso no λ não existe.
 */
import { forcasRelativas, HOME_ADV, AWAY_ADJ, type TeamRates, type Analysis } from "./model";

export type PilarId = "medias" | "hitrate" | "jogador" | "matchup" | "contexto" | "value" | "lesao";

/** Mercados do Veredito que a tela consegue explicar. */
export type MercadoPilarId = "over15" | "over25" | "under35" | "btts";

export type Pilar = {
  id: PilarId;
  nome: string;
  /** O que este pilar mede, em uma linha. */
  explicacao: string;
  /** 0..100 — quão favorável é para o palpite. `null` = sem base. */
  nota: number | null;
  /** 0..100 — fatia do desvio do λ. `null` = não entra no λ (leitura de apoio). */
  peso: number | null;
  /** Multiplicador real usado no λ (1,00 = neutro). `null` = não se aplica. */
  fator: number | null;
  /** Os números que geraram a nota, para ninguém precisar confiar. */
  detalhe: string | null;
  /** Por que este pilar está sem base (só quando `nota === null`). */
  motivo: string | null;
};

export type Modificador = {
  id: "ataque" | "adversario" | "mando" | "h2h";
  rotulo: string;
  fator: number | null;
  detalhe: string;
};

export type Decomposicao = {
  /** Probabilidade do mercado recomendado (0..100) — o mesmo número do card. */
  score: number | null;
  /** Rótulo do mercado explicado ("Over 1.5"). */
  mercado: string | null;
  pilares: Pilar[];
  modificadores: Modificador[];
  /** `true` quando o λ veio do modelo simplificado: não há pesos para abrir. */
  simplificado: boolean;
  aviso: string | null;
};

export type EntradaPilares = {
  modelType: Analysis["model_type"];
  /** Média da liga em gols por jogo (o prior da regressão à média). */
  leagueAvg: number | null;
  rates: { home: TeamRates; away: TeamRates } | null;
  /** Ajuste do confronto direto sobre o total esperado. */
  h2h: { fator: number; aplicado: boolean; jogos?: number } | null;
  /** Mercado recomendado pelo Veredito. */
  mercado: {
    id: MercadoPilarId | null;
    rotulo: string;
    /** 0..100 — probabilidade final (a mesma que a tela mostra). */
    final: number | null;
    /** 0..100 — taxa real observada nos jogos; `null` quando não deu para medir. */
    observado: number | null;
  } | null;
  /** Odd de mercado daquele mercado, quando a fonte publica. */
  odd: number | null;
  /** Escopo do pilar "Jogador" — nesta tela é sempre análise de jogo. */
  temJogador?: boolean;
};

/* ------------------------------------------------------------------ */
/* Aritmética                                                          */
/* ------------------------------------------------------------------ */

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Duas casas para exibição de média. */
const d2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Fator → nota 0..100 com 50 no neutro (1,00).
 * ±0,33 de desvio satura a escala — o mesmo alcance dos limites do modelo.
 */
export function notaDeFator(fator: number): number {
  if (!Number.isFinite(fator) || fator <= 0) return 50;
  return clamp(Math.round(50 + (fator - 1) * 150), 0, 100);
}

/** Fatia de cada fator no desvio logarítmico total. `null` quando nada desviou. */
export function pesosLog(fatores: number[]): (number | null)[] {
  const pernas = fatores.map((f) => (Number.isFinite(f) && f > 0 ? Math.abs(Math.log(f)) : 0));
  const total = pernas.reduce((s, v) => s + v, 0);
  /* Abaixo de 1% de desvio combinado o peso seria ruído: devolvemos null. */
  if (!(total > 0.01)) return fatores.map(() => null);
  return pernas.map((v) => Math.round((v / total) * 100));
}

/** Média geométrica: os dois lados do jogo pesam igual. */
const geo = (a: number, b: number) => Math.sqrt(Math.max(a, 1e-6) * Math.max(b, 1e-6));

const sinalX = (f: number | null) => (f == null ? "—" : `×${d2(f).toFixed(2).replace(".", ",")}`);

/** "×1,15" → frase curta legível. */
function fraseFator(rotulo: string, f: number): string {
  if (f > 1.005) return `${rotulo} ${sinalX(f)} (puxa para cima)`;
  if (f < 0.995) return `${rotulo} ${sinalX(f)} (puxa para baixo)`;
  return `${rotulo} ${sinalX(f)} (neutro)`;
}

/* ------------------------------------------------------------------ */
/* Odd do mercado                                                      */
/* ------------------------------------------------------------------ */

/**
 * Odd do mercado recomendado, quando a fonte publica o par Over/Under da MESMA
 * linha. Sem par → `null` (não dá para medir valor, e não inventamos preço).
 */
export function oddDoMercado(id: MercadoPilarId | null, odds: unknown): number | null {
  if (!id || !odds || typeof odds !== "object") return null;
  const o = odds as Record<string, unknown>;
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 1 && n < 100 ? n : null;
  };
  const linha = Number(o.ou);
  const mesmaLinha = (alvo: number) => Number.isFinite(linha) && Math.abs(linha - alvo) < 0.01;
  if (id === "over15") return mesmaLinha(1.5) ? num(o.over) : null;
  if (id === "over25") return mesmaLinha(2.5) ? num(o.over) : null;
  if (id === "under35") return mesmaLinha(3.5) ? num(o.under) : null;
  /* BTTS: a fonte da rota não publica esse par — fica sem valor por honestidade. */
  return null;
}

/* ------------------------------------------------------------------ */
/* Decomposição                                                        */
/* ------------------------------------------------------------------ */

/**
 * Monta os pilares do jogo. Nunca lança: entrada incompleta vira pilar sem base.
 */
export function decomporPilares(e: EntradaPilares): Decomposicao {
  const merc = e.mercado;
  const score = merc?.final != null && Number.isFinite(merc.final) ? Math.round(merc.final) : null;
  const simplificado = e.modelType !== "dc-poisson-1.0";
  const leagueHalf = e.leagueAvg != null && e.leagueAvg > 0 ? e.leagueAvg / 2 : null;
  const rh = e.rates?.home ?? null;
  const ra = e.rates?.away ?? null;
  const temBase = !simplificado && leagueHalf != null && !!rh && !!ra && rh.games > 0 && ra.games > 0;

  /* ---- fatores reais (mesma conta do λ) ---- */
  let fMedias: number | null = null;
  let fMatchup: number | null = null;
  let fMando: number | null = null;
  let detalheMedias: string | null = null;
  let detalheMatchup: string | null = null;

  if (temBase) {
    const { atkH, defA, atkA, defH } = forcasRelativas(rh!, ra!, leagueHalf!);
    fMedias = geo(atkH, atkA);
    fMatchup = geo(defA, defH);
    fMando = geo(HOME_ADV, AWAY_ADJ);
    detalheMedias =
      `Ataque contra a média da liga: mandante ${sinalX(atkH)} · visitante ${sinalX(atkA)}. ` +
      `Base: ${rh!.games} e ${ra!.games} jogos, 65% da média com xG + 35% do recorte casa/fora.`;
    detalheMatchup =
      `O que cada defesa cede: visitante ${sinalX(defA)} · mandante ${sinalX(defH)}. ` +
      `Acima de 1,00 a defesa cede mais que a média — e o total esperado sobe.`;
  }

  const h2hFator = e.h2h?.aplicado && Number.isFinite(e.h2h.fator) && e.h2h.fator > 0 ? e.h2h.fator : null;
  const fContexto = fMando != null ? (h2hFator != null ? fMando * h2hFator : fMando) : h2hFator;

  /* ---- pesos: fatia do desvio logarítmico entre os que entram no λ ---- */
  const entramNoLambda: number[] = [];
  if (fMedias != null) entramNoLambda.push(fMedias);
  if (fMatchup != null) entramNoLambda.push(fMatchup);
  if (fContexto != null) entramNoLambda.push(fContexto);
  const pesos = pesosLog(entramNoLambda);
  let cursor = 0;
  const pesoMedias = fMedias != null ? pesos[cursor++] ?? null : null;
  const pesoMatchup = fMatchup != null ? pesos[cursor++] ?? null : null;
  const pesoContexto = fContexto != null ? pesos[cursor++] ?? null : null;

  /* ---- Value: só existe com odd real do mesmo mercado ---- */
  const prob = merc?.final != null ? merc.final / 100 : null;
  const ev = prob != null && e.odd != null && e.odd > 1 ? prob * e.odd - 1 : null;
  const detalheValue =
    ev != null && e.odd != null && prob != null
      ? `Odd ${e.odd.toFixed(2).replace(".", ",")} contra ${d2(1 / prob).toFixed(2).replace(".", ",")} de odd justa → EV ${ev > 0 ? "+" : ""}${(ev * 100).toFixed(1)}%.`
      : null;

  const pilares: Pilar[] = [
    {
      id: "medias",
      nome: "Médias",
      explicacao: "Quanto cada ataque produz, comparado com o total da linha.",
      nota: fMedias != null ? notaDeFator(fMedias) : null,
      peso: pesoMedias,
      fator: fMedias,
      detalhe: detalheMedias,
      motivo: temBase ? null : simplificado ? "Modelo simplificado: sem pesos para abrir." : "Sem histórico das duas equipes.",
    },
    {
      id: "matchup",
      nome: "Matchup",
      explicacao: "O quanto as defesas envolvidas cedem no mercado.",
      nota: fMatchup != null ? notaDeFator(fMatchup) : null,
      peso: pesoMatchup,
      fator: fMatchup,
      detalhe: detalheMatchup,
      motivo: temBase ? null : simplificado ? "Modelo simplificado: sem pesos para abrir." : "Sem histórico das duas equipes.",
    },
    {
      id: "contexto",
      nome: "Contexto",
      explicacao: "Mando de campo e o que o confronto direto já mostrou.",
      nota: fContexto != null ? notaDeFator(fContexto) : null,
      peso: pesoContexto,
      fator: fContexto,
      detalhe:
        fContexto == null
          ? null
          : `${fraseFator("Mando", fMando ?? 1)}` +
            (h2hFator != null ? ` · H2H ${sinalX(h2hFator)} em ${e.h2h?.jogos ?? 0} confronto(s)` : " · sem H2H suficiente"),
      motivo: fContexto == null ? "Sem dados de mando/confronto." : null,
    },
    {
      id: "hitrate",
      nome: "Hit rate",
      explicacao: "Quantas vezes o mercado recomendado bateu nos jogos do histórico.",
      nota: merc?.observado != null && Number.isFinite(merc.observado) ? Math.round(merc.observado) : null,
      peso: null,
      fator: null,
      detalhe:
        merc?.observado != null
          ? `${merc.rotulo}: taxa observada de ${Math.round(merc.observado)}% nos jogos recentes das duas equipes. Não entra no λ — é leitura de apoio.`
          : null,
      motivo:
        merc?.observado == null
          ? merc
            ? "A fonte não permite medir esse mercado no histórico."
            : "Nenhum mercado recomendado para este jogo."
          : null,
    },
    {
      id: "value",
      nome: "Value",
      explicacao: "Se a odd paga mais do que o risco que o modelo calculou.",
      nota: ev != null ? clamp(Math.round(50 + ev * 200), 0, 100) : null,
      peso: null,
      fator: null,
      detalhe: detalheValue,
      motivo:
        ev == null
          ? e.odd == null
            ? "Sem odd publicada para este mercado."
            : "Sem probabilidade fechada para comparar."
          : null,
    },
    {
      id: "jogador",
      nome: "Jogador",
      explicacao: "Minutos, titularidade e peso do jogador no time.",
      nota: null,
      peso: null,
      fator: null,
      detalhe: null,
      motivo: e.temJogador ? "Dado de escalação ainda não disponível." : "Análise de jogo — não existe um jogador único.",
    },
    {
      id: "lesao",
      nome: "Lesão",
      explicacao: "Quem está fora e o quanto isso muda o jogo.",
      nota: null,
      peso: null,
      fator: null,
      detalhe: null,
      motivo: "Sem fonte de desfalques nesta rota.",
    },
  ];

  /* ---- modificadores: os multiplicadores que o usuário vê ---- */
  const modificadores: Modificador[] = [];
  if (fMedias != null) {
    modificadores.push({
      id: "ataque",
      rotulo: "×Ataque",
      fator: fMedias,
      detalhe: "Ataque dos dois times contra a média da liga. Acima de 1,00 o jogo tende a ter mais.",
    });
  }
  if (fMatchup != null) {
    modificadores.push({
      id: "adversario",
      rotulo: "×Adversário",
      fator: fMatchup,
      detalhe: "O quanto as defesas cedem. Acima de 1,00 cedem mais que a média do campeonato.",
    });
  }
  if (fMando != null) {
    modificadores.push({
      id: "mando",
      rotulo: "×Mando",
      fator: fMando,
      detalhe: "1,18 na casa e 0,92 fora. Em mercado de total os dois lados quase se anulam — é o esperado.",
    });
  }
  if (h2hFator != null) {
    modificadores.push({
      id: "h2h",
      rotulo: "×H2H",
      fator: h2hFator,
      detalhe: "Ajuste do confronto direto sobre o total esperado, limitado a −15%/+10%.",
    });
  }

  const aviso = simplificado
    ? "Modelo simplificado (amostra curta): os pesos do λ não podem ser abertos."
    : !temBase
      ? "Sem histórico suficiente das duas equipes para decompor o λ."
      : null;

  return {
    score,
    mercado: merc?.rotulo ?? null,
    pilares,
    modificadores,
    simplificado,
    aviso,
  };
}
