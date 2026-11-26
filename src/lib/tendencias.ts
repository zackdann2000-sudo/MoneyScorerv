/**
 * Motor de TENDÊNCIAS — "bateu X de Y nos últimos N jogos".
 *
 * ============================ CONTEXTO DE PRODUTO ============================
 * Referência: a aba "Apitend" do apitou.com.br, reconstruída do zero. O que ela
 * faz, em três passos, e o que replicamos aqui:
 *
 *   1. mediana das últimas N partidas de cada métrica  → tendMediana
 *   2. três linhas candidatas em volta dessa mediana   → tendLinhas
 *   3. quantos dos N jogos passaram de cada linha      → tendPontos
 *
 * O que NÃO copiamos: o original declara "últimos 10 jogos", mas a fonte dele
 * (`raioxRaw.geral`) tem mediana de 3 jogos por time. Aqui a amostra é sempre
 * a que realmente existe, e a tela mostra esse número.
 *
 * Regras não negociáveis (as mesmas do `screener.ts`, que é o irmão deste):
 *   • `null` (dado ausente) NUNCA entra na conta como zero.
 *   • Amostra menor que MIN_AMOSTRA ⇒ o mercado SOME. Não vira 0%.
 *   • Sem banco, sem fetch, sem `Date.now()`: entra e sai por parâmetro.
 *
 * Este arquivo é 100% puro de propósito: é ele que os testes exercitam sem
 * rede e sem Next. Quem busca histórico é `tendenciasFonte.ts`.
 */

import { MIN_COBERTURA } from "./screener";

/** Amostra mínima para publicar qualquer porcentagem (espelha o screener). */
export const MIN_AMOSTRA = MIN_COBERTURA;

/**
 * Amostra mínima para o selo "100%". Com 3 jogos, "bateu 3 de 3" é ruído, não
 * tendência; a frase que vende precisa de 5.
 */
export const MIN_AMOSTRA_CEM = 5;

/** Janela padrão de leitura. */
export const AMOSTRA_PADRAO = 10;

/** Teto: acima disso a mediana reage a mudança de elenco e vira média velha. */
export const AMOSTRA_MAX = 15;

export type Periodo = "total" | "1t" | "2t";
export type LadoTend = "casa" | "fora";
export type Direcao = "over" | "under";

/**
 * O mínimo que o motor precisa de um jogo. `HistGame` (lib/espn) é estrutural-
 * mente compatível — não importamos o tipo para o módulo continuar puro e
 * testável sem arrastar o cliente HTTP da ESPN.
 */
export type JogoAmostra = {
  date: string;
  home: boolean;
  gf: number;
  ga: number;
  htGf: number | null;
  htGa: number | null;
  corners: number | null;
  oppCorners: number | null;
  fouls: number | null;
  oppFouls: number | null;
  yellow: number | null;
  red: number | null;
  oppYellow: number | null;
  oppRed: number | null;
  shots: number | null;
  sot: number | null;
  offsides: number | null;
};

/* ------------------------------------------------------------------ */
/* Estatística descritiva                                             */
/* ------------------------------------------------------------------ */

/** Mediana clássica: ímpar pega o centro, par faz a média dos dois centrais. */
export function tendMediana(vals: readonly number[]): number | null {
  const limpos = vals.filter((v) => Number.isFinite(v));
  if (!limpos.length) return null;
  const ord = [...limpos].sort((a, b) => a - b);
  const n = ord.length;
  if (n % 2 === 1) return ord[(n - 1) / 2];
  return (ord[n / 2 - 1] + ord[n / 2]) / 2;
}

/**
 * Três linhas candidatas em volta da mediana, no passo do mercado.
 *
 * A meia-linha é obrigatória (`arred(med - 0.5) + 0.5`): mercado de contagem
 * raramente é cotado em número inteiro, e uma linha em 9.0 com 9 acertos gera a
 * ambiguidade "9 é mais de 9?". Sempre 8.5 / 9.5 / 10.5.
 *
 * Devolve em ordem crescente, sem duplicata e sem zero.
 */
export function tendLinhas(mediana: number, passo = 1): number[] {
  const p = Number.isFinite(passo) && passo > 0 ? passo : 1;
  /* Sempre uma meia-linha: mediana 9 vira centro 9.5, não 9.0. */
  const centro = Math.max(0.5, Math.round(mediana - 0.5) + 0.5);
  const brutas = [centro - p, centro, centro + p].map((l) => Math.round(l * 10) / 10);
  const out: number[] = [];
  for (const l of brutas) {
    if (l <= 0) continue;
    if (!out.includes(l)) out.push(l);
  }
  return out.sort((a, b) => a - b);
}

export type Pontos = {
  /** Quantos dos jogos com dado passaram a linha. */
  hit: number;
  /** Quantos jogos tinham dado (nunca inclui `null`). */
  n: number;
  /** 0/1 em ordem cronológica (mais antigo → mais recente), para as bolinhas. */
  serie: (0 | 1)[];
  pct: number | null;
};

/**
 * Conta quantos jogos passaram a linha.
 *
 * `under` inverte a comparação — o motor já nasce pronto para "menos de", mesmo
 * que a lista principal exiba só "mais de" (menos ruído na tela).
 *
 * Jogo sem dado (`null`) é pulado: se 10 jogos existem e 4 não têm escanteio,
 * `n` é 6, não 10. Mostrar "6 de 10" quando só 6 têm dado seria mentira.
 */
export function tendPontos(vals: readonly (number | null)[], linha: number, dir: Direcao = "over"): Pontos {
  const serie: (0 | 1)[] = [];
  for (const v of vals) {
    if (v == null || !Number.isFinite(v)) continue;
    const passou = dir === "under" ? v < linha : v > linha;
    serie.push(passou ? 1 : 0);
  }
  const n = serie.length;
  const hit = serie.reduce<number>((s, v) => s + v, 0);
  return { hit, n, serie, pct: n >= MIN_AMOSTRA ? Math.round((hit / n) * 100) : null };
}

/* ------------------------------------------------------------------ */
/* Catálogo de métricas                                               */
/* ------------------------------------------------------------------ */

/**
 * De onde sai o valor de uma métrica.
 *  - `jogo`: soma dos dois lados (total da partida) → usa o histórico do lado
 *    que está sendo lido e o `opp*` do mesmo jogo.
 *  - `time`: só o que o time produziu.
 *  - `btts`: binário "os dois marcaram".
 */
export type Escopo = "jogo" | "time" | "btts";

export type Metrica = {
  id: string;
  rotulo: string;
  escopo: Escopo;
  /** Passo das linhas candidatas. Faltas andam de 2 em 2. */
  passo: number;
  /** Períodos em que esta métrica tem dado. 1t/2t só onde a fonte entrega. */
  periodos: Periodo[];
  /** Valor do jogo para o lado lido. `null` = sem dado (nunca 0). */
  valor: (g: JogoAmostra, periodo: Periodo) => number | null;
};

/** Amarelo + vermelho, tolerando um dos dois ausente. */
const cartoesDe = (amarelo: number | null, vermelho: number | null): number | null => {
  if (amarelo == null && vermelho == null) return null;
  return (amarelo ?? 0) + (vermelho ?? 0);
};

/** Gols do time naquele período. 2º tempo = total − 1º tempo (nunca inventa). */
const golsDoTime = (g: JogoAmostra, periodo: Periodo): number | null => {
  if (periodo === "total") return g.gf;
  if (g.htGf == null || g.htGa == null) return null;
  if (periodo === "1t") return g.htGf;
  return g.gf - g.htGf;
};

const golsSofridos = (g: JogoAmostra, periodo: Periodo): number | null => {
  if (periodo === "total") return g.ga;
  if (g.htGf == null || g.htGa == null) return null;
  if (periodo === "1t") return g.htGa;
  return g.ga - g.htGa;
};

/**
 * Catálogo. A ordem é a de exibição quando dois mercados empatam em `pct`.
 * Só entra o que a fonte ESPN entrega por partida; 1T/2T aqui existe apenas
 * para gols — cantos/cartões por tempo vêm do adaptador do Apitou (fonte B).
 */
export const METRICAS: Metrica[] = [
  {
    id: "gols_jogo",
    rotulo: "Gols na partida",
    escopo: "jogo",
    passo: 1,
    periodos: ["total", "1t", "2t"],
    valor: (g, p) => {
      const a = golsDoTime(g, p);
      const b = golsSofridos(g, p);
      return a == null || b == null ? null : a + b;
    },
  },
  {
    id: "gols_time",
    rotulo: "Gols do time",
    escopo: "time",
    passo: 1,
    periodos: ["total", "1t", "2t"],
    valor: golsDoTime,
  },
  {
    id: "cantos_jogo",
    rotulo: "Escanteios do jogo",
    escopo: "jogo",
    passo: 1,
    periodos: ["total"],
    valor: (g) => (g.corners == null || g.oppCorners == null ? null : g.corners + g.oppCorners),
  },
  {
    id: "cantos_time",
    rotulo: "Escanteios do time",
    escopo: "time",
    passo: 1,
    periodos: ["total"],
    valor: (g) => g.corners,
  },
  {
    id: "cartoes_jogo",
    rotulo: "Cartões do jogo",
    escopo: "jogo",
    passo: 1,
    periodos: ["total"],
    valor: (g) => {
      const a = cartoesDe(g.yellow, g.red);
      const b = cartoesDe(g.oppYellow, g.oppRed);
      return a == null || b == null ? null : a + b;
    },
  },
  {
    id: "cartoes_time",
    rotulo: "Cartões do time",
    escopo: "time",
    passo: 1,
    periodos: ["total"],
    valor: (g) => cartoesDe(g.yellow, g.red),
  },
  {
    id: "faltas_jogo",
    rotulo: "Faltas na partida",
    escopo: "jogo",
    passo: 2,
    periodos: ["total"],
    valor: (g) => (g.fouls == null || g.oppFouls == null ? null : g.fouls + g.oppFouls),
  },
  {
    id: "fin_time",
    rotulo: "Finalizações do time",
    escopo: "time",
    passo: 1,
    periodos: ["total"],
    valor: (g) => g.shots,
  },
  {
    id: "chutesgol_time",
    rotulo: "Chutes a gol do time",
    escopo: "time",
    passo: 1,
    periodos: ["total"],
    valor: (g) => g.sot,
  },
  {
    id: "impedimentos_time",
    rotulo: "Impedimentos do time",
    escopo: "time",
    passo: 1,
    periodos: ["total"],
    valor: (g) => g.offsides,
  },
  {
    id: "btts",
    rotulo: "Ambas marcam",
    escopo: "btts",
    passo: 1,
    periodos: ["total"],
    valor: (g) => (g.gf > 0 && g.ga > 0 ? 1 : 0),
  },
];

/* ------------------------------------------------------------------ */
/* Geração                                                            */
/* ------------------------------------------------------------------ */

export type Tendencia = {
  id: string;
  metrica: string;
  rotulo: string;
  periodo: Periodo;
  /** `null` quando a métrica é de jogo (não tem lado). */
  lado: LadoTend | null;
  linha: number;
  /** Direção do mercado. A UI principal usa só "over". */
  dir: Direcao;
  mediana: number;
  hit: number;
  n: number;
  pct: number;
  serie: (0 | 1)[];
  cemPorCento: boolean;
  amostraCurta: boolean;
};

export type OpcoesGerar = {
  amostra?: number;
  periodo?: Periodo;
  dir?: Direcao;
  /** Só métricas de jogo (sem lado) e vice-versa. Vazio = todas. */
  metricas?: string[];
  /** Máximo de linhas por métrica. 3 é o que o original mostra. */
  linhasPorMetrica?: number;
};

/** Ordena do mais antigo para o mais recente — a série lê nessa ordem. */
export function cronologico<T extends { date: string }>(jogos: readonly T[]): T[] {
  return [...jogos].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/** Últimos N jogos, já em ordem cronológica. */
function janela<T extends { date: string }>(jogos: readonly T[], amostra: number): T[] {
  return cronologico(jogos).slice(-amostra);
}

/**
 * Gera as tendências de um confronto.
 *
 * `casa` e `fora` são os históricos do mandante e do visitante. Na métrica de
 * jogo os dois históricos são empilhados (é o que o original faz) porque o
 * total da partida depende dos dois.
 *
 * Descarta tudo com `pct === null` — ou seja, amostra < MIN_AMOSTRA. É essa
 * linha que implementa a regra de ouro: mercado sem amostra não aparece.
 */
export function gerarTendencias(
  casa: readonly JogoAmostra[],
  fora: readonly JogoAmostra[],
  opts: OpcoesGerar = {}
): Tendencia[] {
  const amostra = Math.min(Math.max(opts.amostra ?? AMOSTRA_PADRAO, MIN_AMOSTRA), AMOSTRA_MAX);
  const dir: Direcao = opts.dir ?? "over";
  const periodoFiltro = opts.periodo ?? "total";
  const maxLinhas = Math.max(1, opts.linhasPorMetrica ?? 3);

  const hc = janela(casa, amostra);
  const hf = janela(fora, amostra);
  /* Regra de ouro aplicada POR LADO, antes de qualquer conta.

     A métrica de jogo empilha os dois históricos (é o total da partida, fiel
     ao original). O problema: dois times com 2 jogos cada dariam uma amostra
     de 4 e o mercado apareceria — mas nenhum dos dois tem 3 jogos de verdade.
     Por isso o empilhamento só vale quando OS DOIS lados têm amostra mínima. */
  const suficiente = { casa: hc.length >= MIN_AMOSTRA, fora: hf.length >= MIN_AMOSTRA };
  const saida: Tendencia[] = [];

  for (const m of METRICAS) {
    if (opts.metricas?.length && !opts.metricas.includes(m.id)) continue;
    if (!m.periodos.includes(periodoFiltro)) continue;

    /* Em 1º/2º tempo a métrica de jogo soma os dois lados; no total também.
       Para o lado, cada histórico fala por si. */
    const alvos: { lado: LadoTend | null; jogos: JogoAmostra[]; ok: boolean }[] =
      m.escopo === "time"
        ? [
            { lado: "casa" as const, jogos: hc, ok: suficiente.casa },
            { lado: "fora" as const, jogos: hf, ok: suficiente.fora },
          ].filter((a) => a.ok)
        : suficiente.casa && suficiente.fora
          ? [{ lado: null, jogos: [...hc, ...hf], ok: true }]
          : [];

    for (const alvo of alvos) {
      const vals = alvo.jogos.map((g) => m.valor(g, periodoFiltro));
      const mediana = tendMediana(vals.filter((v): v is number => v != null));
      if (mediana == null) continue;

      for (const linha of tendLinhas(mediana, m.passo).slice(0, maxLinhas)) {
        const p = tendPontos(vals, linha, dir);
        /* Regra de ouro: sem amostra mínima o mercado some. */
        if (p.pct == null) continue;
        saida.push({
          id: `${m.id}:${linha}${alvo.lado ? `:${alvo.lado}` : ""}`,
          metrica: m.id,
          rotulo: m.rotulo,
          periodo: periodoFiltro,
          lado: alvo.lado,
          linha,
          dir,
          mediana: Math.round(mediana * 100) / 100,
          hit: p.hit,
          n: p.n,
          pct: p.pct,
          serie: p.serie,
          cemPorCento: p.hit === p.n && p.n >= MIN_AMOSTRA_CEM,
          amostraCurta: p.n < MIN_AMOSTRA_CEM,
        });
      }
    }
  }

  return saida.sort(compararTendencias);
}

/**
 * Ordem de exibição: primeiro o que "vende" (100% com amostra decente), depois
 * quem mais acerta, e no empate a amostra maior — porque 9 de 10 é mais forte
 * que 3 de 3.
 */
export function compararTendencias(a: Tendencia, b: Tendencia): number {
  if (a.cemPorCento !== b.cemPorCento) return a.cemPorCento ? -1 : 1;
  if (b.pct !== a.pct) return b.pct - a.pct;
  if (b.n !== a.n) return b.n - a.n;
  return a.id.localeCompare(b.id);
}

/** As N melhores, já filtradas de amostra curta. Serve para o bloco "Quentes". */
export function melhoresTendencias(todas: readonly Tendencia[], n = 3): Tendencia[] {
  return todas.filter((t) => !t.amostraCurta).slice(0, n);
}

/* ------------------------------------------------------------------ */
/* Quentes: forma e sequências                                        */
/* ------------------------------------------------------------------ */

export type Sequencia = {
  /** Chave estável para a UI não recriar o nó a cada render. */
  id: string;
  texto: string;
  /** Só para destaque visual (>= 70% ou sequência longa). */
  destaque: boolean;
  n: number;
};

/** V/E/D dos últimos N, do mais antigo para o mais recente. */
export function faixaResultados(jogos: readonly JogoAmostra[], n = AMOSTRA_PADRAO): ("V" | "E" | "D")[] {
  const ultimos = janela(jogos, n);
  return ultimos.map((g) => (g.gf > g.ga ? "V" : g.gf < g.ga ? "D" : "E"));
}

/**
 * Sequências automáticas — só as que a amostra sustenta.
 *
 * Cada regra exige `n >= MIN_AMOSTRA` para aparecer: com 2 jogos "não perde há
 * 2" não é informação. A contagem é feita do jogo mais recente para trás e
 * para no primeiro que quebra a regra — é o "há N jogos" de verdade.
 */
export function sequencias(jogos: readonly JogoAmostra[]): Sequencia[] {
  const cron = cronologico(jogos);
  if (cron.length < MIN_AMOSTRA) return [];
  const rev = [...cron].reverse();

  /** Quantos jogos consecutivos (do mais recente) satisfazem o predicado. */
  const seguidas = (pred: (g: JogoAmostra) => boolean): number => {
    let k = 0;
    for (const g of rev) {
      if (!pred(g)) break;
      k++;
    }
    return k;
  };

  const out: Sequencia[] = [];
  const add = (id: string, texto: string, n: number, destaque = false) => {
    if (n < MIN_AMOSTRA) return;
    out.push({ id, texto, destaque: destaque || n >= MIN_AMOSTRA_CEM, n });
  };

  add("venceu", "Venceu os últimos", seguidas((g) => g.gf > g.ga));
  add("nao_perde", "Não perde há", seguidas((g) => g.gf >= g.ga));
  add("nao_vence", "Não vence há", seguidas((g) => g.gf <= g.ga));
  add("marcou", "Marcou gol nos últimos", seguidas((g) => g.gf > 0));
  add("sem_sofrer", "Não sofreu gol há", seguidas((g) => g.ga === 0));

  return out;
}

export type QuentesLado = {
  faixa: ("V" | "E" | "D")[];
  sequencias: Sequencia[];
  /** Pct de vitória na amostra — contexto, não previsão. */
  aproveitamento: number | null;
  amostra: number;
};

/** Bloco "Quentes" de um lado do confronto. */
export function gerarQuentes(jogos: readonly JogoAmostra[], amostra = AMOSTRA_PADRAO): QuentesLado {
  const j = janela(jogos, amostra);
  const faixa = faixaResultados(j, amostra);
  const vitorias = faixa.filter((r) => r === "V").length;
  return {
    faixa,
    sequencias: sequencias(j),
    aproveitamento: faixa.length >= MIN_AMOSTRA ? Math.round((vitorias / faixa.length) * 100) : null,
    amostra: faixa.length,
  };
}
