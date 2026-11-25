import type { HistGame, Match } from "./espn";

/* =============================================================================
   SCREENER — motor puro de "frequência por mercado" (contexto, NÃO previsão).

   Referência de produto: o Screener do Bet Detector (recon em
   .recon/betdetector/RELATORIO_DIFERENCIAL.md §4). A diferença é o que NÃO
   fazemos: aqui não existe probabilidade, não existe odd e não existe EV. O
   número publicado é sempre "em X dos últimos N jogos o mercado aconteceu".

   Regras não negociáveis desta lib:
   • `null` (dado ausente) NUNCA entra na conta como zero.
   • Cobertura menor que MIN_COBERTURA ⇒ mercado some da resposta, não vira 0%.
   • Sem banco, sem fetch, sem `Date.now()`: entra e sai por parâmetro (testável).
   ========================================================================== */

/** Amostra mínima para publicar um percentual. */
export const MIN_COBERTURA = 3;

/** Frequência mínima para o mercado "passar" no filtro. */
export const LIMIAR_PADRAO = 60;

export type Etapa = "A" | "B";

/** Lado da série: mandante joga em casa, visitante joga fora. */
export type Lado = "casa" | "fora";

export type MercadoScreener = {
  id: string;
  label: string;
  /** A = sai do schedule (placar). B = exige summary (cantos/cartões/impedimentos). */
  etapa: Etapa;
  /** Lados que precisam sustentar o mercado. */
  lados: Lado[];
  /** Peso no ranking do screener (não aparece como número na UI). */
  peso: number;
  /** Valor 0/1 do jogo (ou número bruto, comparado com `linha`). */
  valor: (g: HistGame) => number | null;
  linha: number;
  /** Texto curto do que está sendo contado. */
  criterio: string;
};

/* Cartões do próprio time. Amarelo e vermelho podem faltar individualmente:
   se AMBOS faltarem, o jogo não tem dado (null). Um vermelho ausente com
   amarelo presente conta como 1 amarelo só — não inventamos o vermelho. */
const cartoesDoTime = (g: HistGame): number | null => {
  if (g.yellow == null && g.red == null) return null;
  return (g.yellow ?? 0) + (g.red ?? 0);
};

const gols1T = (g: HistGame): number | null =>
  g.htGf == null || g.htGa == null ? null : g.htGf + g.htGa;

export const MERCADOS: MercadoScreener[] = [
  { id: "btts", label: "Ambas marcam", etapa: "A", lados: ["casa", "fora"], peso: 3, linha: 0.5, criterio: "jogos em que os dois times marcaram", valor: (g) => (g.gf > 0 && g.ga > 0 ? 1 : 0) },
  { id: "over_1_5", label: "Over 1.5 gols", etapa: "A", lados: ["casa", "fora"], peso: 3, linha: 1.5, criterio: "jogos com 2 ou mais gols", valor: (g) => g.gf + g.ga },
  { id: "over_2_5", label: "Over 2.5 gols", etapa: "A", lados: ["casa", "fora"], peso: 2, linha: 2.5, criterio: "jogos com 3 ou mais gols", valor: (g) => g.gf + g.ga },
  { id: "cards_ambos_1_5", label: "Ambas 1.5+ cartões", etapa: "B", lados: ["casa", "fora"], peso: 2, linha: 1.5, criterio: "jogos em que o time levou 2+ cartões", valor: cartoesDoTime },
  { id: "ht_over_0_5", label: "1º tempo 0.5+ gols", etapa: "A", lados: ["casa", "fora"], peso: 2, linha: 0.5, criterio: "jogos com gol no 1º tempo", valor: gols1T },
  { id: "visitante_ht_0_5", label: "Visitante 0.5+ gols no 1ºT", etapa: "A", lados: ["fora"], peso: 2, linha: 0.5, criterio: "jogos em que o visitante marcou no 1º tempo", valor: (g) => g.htGf },
  { id: "visitante_1_5", label: "Visitante 1.5+ gols", etapa: "A", lados: ["fora"], peso: 2, linha: 1.5, criterio: "jogos em que o visitante marcou 2+", valor: (g) => g.gf },
  { id: "casa_vence", label: "Mandante vence em casa", etapa: "A", lados: ["casa"], peso: 2, linha: 0.5, criterio: "jogos em casa em que o time venceu", valor: (g) => (g.res === "V" ? 1 : 0) },
  { id: "visitante_vence", label: "Visitante vence fora", etapa: "A", lados: ["fora"], peso: 2, linha: 0.5, criterio: "jogos fora em que o time venceu", valor: (g) => (g.res === "V" ? 1 : 0) },
  { id: "impedimentos_1_5", label: "Impedimentos 1.5+", etapa: "B", lados: ["casa", "fora"], peso: 1, linha: 1.5, criterio: "jogos em que o time teve 2+ impedimentos", valor: (g) => g.offsides },
  { id: "cantos_time_4_5", label: "Escanteios do time 4.5+", etapa: "B", lados: ["casa", "fora"], peso: 2, linha: 4.5, criterio: "jogos em que o time teve 5+ escanteios", valor: (g) => g.corners },
  { id: "cantos_jogo_9_5", label: "Escanteios do jogo 9.5+", etapa: "B", lados: ["casa", "fora"], peso: 1, linha: 9.5, criterio: "jogos com 10+ escanteios no total", valor: (g) => (g.corners == null || g.oppCorners == null ? null : g.corners + g.oppCorners) },
];

export const mercadosPorEtapa = (etapa: Etapa) => MERCADOS.filter((m) => m.etapa === etapa);

export type LadoAvaliado = {
  acertos: number;
  total: number;
  pct: number | null;
  /** 0/1 na ordem cronológica (mais antigo primeiro), para as bolinhas. */
  serie: (0 | 1)[];
  /** Quantos jogos da amostra tinham o dado (pode ser < amostra). */
  cobertura: number;
  /** A amostra caiu para "todos os jogos" porque o mando tinha < MIN_COBERTURA. */
  semMando?: boolean;
};

export type MercadoAvaliado = {
  id: string;
  label: string;
  etapa: Etapa;
  criterio: string;
  linha: number;
  /** Só os lados exigidos pelo mercado. */
  lados: Partial<Record<Lado, LadoAvaliado>>;
  /** Menor pct entre os lados exigidos — é o número que manda no filtro. */
  pct: number | null;
  /** Passou do limiar em TODOS os lados exigidos. */
  aprovado: boolean;
};

export type JogoAvaliado = {
  aprovados: string[];
  score: number;
  mercados: MercadoAvaliado[];
  /** Mercados pedidos que não puderam ser calculados (sem dado). */
  semDado: string[];
};

/** Ordena do mais antigo para o mais recente (a série de forma lê nessa ordem). */
const cronologico = (games: HistGame[]) => [...games].sort((a, b) => String(a.date).localeCompare(String(b.date)));

/**
 * Avalia UM lado do confronto.
 * `lado` define o filtro de mando: casa ⇒ só jogos em casa; fora ⇒ só fora.
 */
export function avaliarLado(
  games: HistGame[],
  def: MercadoScreener,
  lado: Lado,
  opts: { mando?: "contexto" | "todos"; amostra?: number } = {}
): LadoAvaliado {
  const amostra = opts.amostra === 5 ? 5 : 10;
  const querMando = (opts.mando ?? "contexto") === "contexto";
  const base = cronologico(games).slice(-amostra);
  const doMando = querMando ? base.filter((g) => (lado === "casa" ? g.home : !g.home)) : base;
  /* Poucos jogos no mando pedido: cai para a amostra inteira e marca a flag —
     melhor publicar com o aviso do que esconder um time que só jogou 2 em casa. */
  const semMando = querMando && doMando.length < MIN_COBERTURA;
  const usados = semMando ? base : doMando;
  const linhas: (0 | 1)[] = [];
  let cobertura = 0;
  for (const g of usados) {
    const v = def.valor(g);
    if (v == null) continue;
    cobertura++;
    linhas.push(v > def.linha ? 1 : 0);
  }
  const acertos = linhas.reduce<number>((s, v) => s + v, 0);
  return {
    acertos,
    total: linhas.length,
    pct: cobertura >= MIN_COBERTURA ? Math.round((acertos / linhas.length) * 100) : null,
    serie: linhas,
    cobertura,
    ...(semMando ? { semMando: true } : {}),
  };
}

/**
 * Avalia um confronto nos mercados pedidos.
 * `casa`/`fora` são os históricos do mandante e do visitante (qualquer ordem).
 */
export function avaliarJogo(
  casa: HistGame[],
  fora: HistGame[],
  opts: { mercados?: string[]; etapa?: Etapa; limiar?: number; mando?: "contexto" | "todos"; amostra?: number } = {}
): JogoAvaliado {
  const limiar = opts.limiar ?? LIMIAR_PADRAO;
  const quer = opts.mercados?.length ? MERCADOS.filter((m) => opts.mercados!.includes(m.id)) : mercadosPorEtapa(opts.etapa ?? "A");

  const mercados: MercadoAvaliado[] = [];
  const semDado: string[] = [];

  for (const def of quer) {
    const lados: Partial<Record<Lado, LadoAvaliado>> = {};
    for (const lado of def.lados) {
      lados[lado] = avaliarLado(lado === "casa" ? casa : fora, def, lado, opts);
    }
    const pcts = def.lados.map((l) => lados[l]!.pct).filter((p): p is number => p != null);
    if (pcts.length !== def.lados.length) {
      /* Um dos lados sem base suficiente: o mercado inteiro fica sem dado. */
      semDado.push(def.id);
      continue;
    }
    const pct = Math.min(...pcts);
    mercados.push({
      id: def.id,
      label: def.label,
      etapa: def.etapa,
      criterio: def.criterio,
      linha: def.linha,
      lados,
      pct,
      aprovado: pct >= limiar,
    });
  }

  const aprovados = mercados.filter((m) => m.aprovado);
  const score = +mercados
    .filter((m) => m.aprovado)
    .reduce((s, m) => {
      const def = MERCADOS.find((d) => d.id === m.id)!;
      return s + (m.pct! / 100 - 0.5) * def.peso;
    }, 0)
    .toFixed(3);

  return { aprovados: aprovados.map((m) => m.id), score, mercados, semDado };
}

/** Nome do confronto no formato da casa — usado no card do screener. */
export const nomeConfronto = (m: Match) => `${m.home.name} x ${m.away.name}`;
