/**
 * Competência do modelo por LIGA × MERCADO — módulo PURO.
 *
 * Sem DB, sem rede, sem `fetch`: é a matemática que a tela `/desempenho` usa,
 * por isso mora aqui e não dentro da rota (mesma divisão de `clv.ts`).
 *
 * ## O que este bloco responde
 *
 * "O modelo é bom nesta liga, neste mercado?" — e responde com três números que
 * não se cobrem:
 *
 *   · **Acerto**  → greens ÷ liquidadas. Simples, mas sozinho engana: acertar
 *     70% em odds de 1.30 dá prejuízo.
 *   · **ROI**     → lucro ÷ apostado, com stake FIXA de 1 unidade. Mede o
 *     modelo, não o nosso sizing. Positivo é o que paga a conta.
 *   · **Brier**   → média de (probabilidade do modelo − resultado)². É a nota
 *     de calibração: diz se a probabilidade publicada é honesta, não só se o
 *     lado certo foi escolhido. Menor é melhor; 0,25 é o chute 50/50.
 *
 * ## Regra que não pode mudar
 *
 * Abaixo de `MIN_AMOSTRA` liquidações o bloco NÃO vira linha de tabela: vira
 * "Aguardando dados". Nunca arredondamos 2 acertos em 3 para "67%" e nunca
 * preenchemos lacuna com média inventada — é a mesma regra de `clv.ts`.
 *
 * Pendente, ao vivo e anulada não entram em nenhum denominador: só green e red
 * contam, porque só eles têm resultado.
 */

/** Liquidações mínimas para publicar acerto/Brier/ROI de um par liga × mercado. */
export const MIN_AMOSTRA = 10;

/**
 * Brier de referência: um modelo que sempre diz 50% tira 0,25 numa aposta
 * binária. Serve de régua na tela ("abaixo disso o número está calibrado").
 */
export const BRIER_REFERENCIA = 0.25;

/** Linha de entrada: o mínimo que a agregação precisa saber de uma pick. */
export type PickCompetencia = {
  /** Nome da liga como foi gravado no ledger (`league_name`). */
  leagueName: string;
  /** Chave do mercado (`over25`, `btts`, `cards_over`, ...). */
  mercado: string;
  /** Texto humano do pick ("Over 2.5 gols"). Cai para o mapa interno se vazio. */
  rotulo?: string | null;
  /** Linha do mercado, quando existe (cartões/escanteios). */
  linha?: number | null;
  /** "green" | "red" | "pendente" | "ao_vivo" | "anulada". */
  status: string;
  /** Probabilidade do modelo (0..1). Aceita 0..100 e normaliza. */
  probModelo?: number | null;
  /** Odd publicada (usada no lucro). */
  odd?: number | null;
};

export type LinhaCompetencia = {
  /** Identidade estável da linha (liga + mercado + linha). */
  key: string;
  liga: string;
  mercado: string;
  /** Rótulo pronto para a tela. */
  rotulo: string;
  /** Picks com resultado (green + red). */
  liquidadas: number;
  greens: number;
  reds: number;
  /** % de acerto, 1 casa. `null` sem liquidação. */
  acerto: number | null;
  /**
   * Probabilidade média que o modelo publicou (em %). Comparar com `acerto` é
   * o teste de calibração em uma linha: se esperava 62% e acertou 58%, está
   * dentro do ruído; se esperava 62% e acertou 38%, o modelo está mentindo
   * nesta liga.
   */
  esperado: number | null;
  /** Brier score (menor = melhor). `null` quando falta a probabilidade. */
  brier: number | null;
  /** ROI % nas picks com odd válida (stake fixa de 1 unidade). */
  roi: number | null;
  /** Lucro em unidades (stake 1) das picks com odd válida. */
  lucro: number;
  /** Quantas picks da linha entram no ROI (odd > 1). */
  comOdd: number;
  /** Odd média publicada. */
  oddMedia: number | null;
  /** Intervalo de confiança 95% do acerto (0..1). */
  wilson: { low: number; high: number } | null;
  /** true quando `liquidadas >= MIN_AMOSTRA` (única condição para publicar). */
  amostraSuficiente: boolean;
  /** Quantas liquidações faltam para sair de "Aguardando dados". */
  faltam: number;
};

export type ResumoCompetencia = {
  /** Pares com amostra suficiente, do maior para o menor. */
  linhas: LinhaCompetencia[];
  /** Pares ainda em coleta — a tela mostra como "Aguardando dados". */
  aguardando: LinhaCompetencia[];
  total: {
    liquidadas: number;
    greens: number;
    reds: number;
    acerto: number | null;
    brier: number | null;
    roi: number | null;
    lucro: number;
    ligas: number;
    mercados: number;
    /** Pares (liga × mercado) com amostra suficiente. */
    paresProntos: number;
    /** Pares ainda em coleta. */
    paresAguardando: number;
  };
  /** Amostra mínima aplicada (vai para a tela, não para o código). */
  minAmostra: number;
  /** Picks sem liga no ledger: não formam par, mas são contadas. */
  semLiga: number;
};

/**
 * Rótulos padrão quando o ledger não trouxe `rotulo`. Só para leitura humana —
 * nenhum número depende disto.
 */
export const ROTULO_MERCADO: Record<string, string> = {
  home: "Vitória casa",
  draw: "Empate",
  away: "Vitória fora",
  over25: "Over 2.5 gols",
  under25: "Under 2.5 gols",
  btts: "Ambas marcam",
  cards_over: "Cartões acima da linha",
  cards_under: "Cartões abaixo da linha",
  corners_over: "Escanteios acima da linha",
  corners_under: "Escanteios abaixo da linha",
};

/**
 * Intervalo de Wilson 95% para uma proporção.
 *
 * Cópia local de `credibility.wilson()` — aquele módulo importa o banco e este
 * aqui precisa continuar puro para rodar no `unit-tests.sh` sem DATABASE_URL.
 * Se um dia o cálculo mudar, mude nos dois.
 */
export function wilson(hits: number, n: number, z = 1.96): { low: number; high: number } | null {
  if (n <= 0) return null;
  const p = hits / n;
  const z2 = z * z;
  const den = 1 + z2 / n;
  const centro = p + z2 / (2 * n);
  const margem = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  return {
    low: Math.max(0, Math.round(((centro - margem) / den) * 1000) / 1000),
    high: Math.min(1, Math.round(((centro + margem) / den) * 1000) / 1000),
  };
}

/** Probabilidade em 0..1. O ledger grava 0..1; 0..100 é tolerado e normalizado. */
function prob01(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const x = v > 1 ? v / 100 : v;
  if (x < 0 || x > 1) return null;
  return x;
}

const media = (xs: number[]): number | null =>
  xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 100) / 100 : null;

const umaCasa = (v: number) => Math.round(v * 10) / 10;

/** Rótulo do par: prefere o texto do próprio pick (já traz a linha). */
function rotuloDe(p: PickCompetencia): string {
  const doPick = String(p.rotulo ?? "").trim();
  if (doPick) return doPick;
  const base = ROTULO_MERCADO[p.mercado] ?? p.mercado;
  if (p.linha != null && Number.isFinite(p.linha) && p.mercado.startsWith("cards")) return `${base} ${p.linha}`;
  if (p.linha != null && Number.isFinite(p.linha) && p.mercado.startsWith("corners")) return `${base} ${p.linha}`;
  return base;
}

/** Chave do agrupamento: linha diferente de cartão/escanteio é par diferente. */
function chaveDe(liga: string, p: PickCompetencia): string {
  const linha = p.linha != null && Number.isFinite(p.linha) ? String(p.linha) : "-";
  return `${liga}||${p.mercado}||${linha}`;
}

type Acumulado = {
  liga: string;
  mercado: string;
  rotulo: string;
  greens: number;
  reds: number;
  probs: number[];
  briers: number[];
  lucro: number;
  comOdd: number;
  odds: number[];
};

/**
 * Agrupa as picks por liga × mercado e devolve acerto, Brier e ROI.
 *
 * - Só green/red entram (pendente, ao vivo e anulada ficam fora de tudo).
 * - ROI usa stake fixa de 1 unidade e só picks com odd válida (> 1).
 * - Brier usa apenas picks que têm `probModelo` — sem probabilidade o índice
 *   não existe, e ele fica `null` em vez de virar zero.
 * - Pick sem liga não forma par: entra em `semLiga` (visível na tela).
 */
export function agruparCompetencia(picks: PickCompetencia[]): ResumoCompetencia {
  const acc = new Map<string, Acumulado>();
  let semLiga = 0;
  let totalGreens = 0;
  let totalReds = 0;
  let totalLucro = 0;
  let totalComOdd = 0;
  const todasProbs: number[] = [];
  const todosBriers: number[] = [];
  const ligas = new Set<string>();
  const mercados = new Set<string>();

  for (const p of picks) {
    if (p.status !== "green" && p.status !== "red") continue;
    const liga = String(p.leagueName ?? "").trim();
    if (!liga) {
      semLiga++;
      continue;
    }
    const key = chaveDe(liga, p);
    let b = acc.get(key);
    if (!b) {
      b = {
        liga,
        mercado: p.mercado,
        rotulo: rotuloDe(p),
        greens: 0,
        reds: 0,
        probs: [],
        briers: [],
        lucro: 0,
        comOdd: 0,
        odds: [],
      };
      acc.set(key, b);
    }

    const green = p.status === "green";
    const odd = p.odd != null && Number.isFinite(p.odd) && p.odd > 1 ? Number(p.odd) : null;
    const prob = prob01(p.probModelo);
    const desfecho = green ? 1 : 0;

    if (green) {
      b.greens++;
      totalGreens++;
    } else {
      b.reds++;
      totalReds++;
    }

    if (prob != null) {
      b.probs.push(prob);
      b.briers.push((prob - desfecho) ** 2);
      todasProbs.push(prob);
      todosBriers.push((prob - desfecho) ** 2);
    }

    if (odd != null) {
      const variacao = green ? odd - 1 : -1;
      b.lucro += variacao;
      b.comOdd++;
      b.odds.push(odd);
      totalLucro += variacao;
      totalComOdd++;
    }

    ligas.add(liga);
    mercados.add(p.mercado);
  }

  const montar = (key: string, b: Acumulado): LinhaCompetencia => {
    const liquidadas = b.greens + b.reds;
    const w = wilson(b.greens, liquidadas);
    return {
      key,
      liga: b.liga,
      mercado: b.mercado,
      rotulo: b.rotulo,
      liquidadas,
      greens: b.greens,
      reds: b.reds,
      acerto: liquidadas ? umaCasa((b.greens / liquidadas) * 100) : null,
      esperado: b.probs.length ? umaCasa((b.probs.reduce((s, x) => s + x, 0) / b.probs.length) * 100) : null,
      brier: b.briers.length ? Math.round((b.briers.reduce((s, x) => s + x, 0) / b.briers.length) * 1000) / 1000 : null,
      roi: b.comOdd ? umaCasa((b.lucro / b.comOdd) * 100) : null,
      lucro: Math.round(b.lucro * 1000) / 1000,
      comOdd: b.comOdd,
      oddMedia: media(b.odds),
      wilson: w,
      amostraSuficiente: liquidadas >= MIN_AMOSTRA,
      faltam: Math.max(0, MIN_AMOSTRA - liquidadas),
    };
  };

  const todas = [...acc.entries()].map(([key, b]) => montar(key, b));
  const ordem = (a: LinhaCompetencia, b: LinhaCompetencia) =>
    b.liquidadas - a.liquidadas || a.liga.localeCompare(b.liga) || a.rotulo.localeCompare(b.rotulo);

  const linhas = todas.filter((l) => l.amostraSuficiente).sort(ordem);
  const aguardando = todas.filter((l) => !l.amostraSuficiente).sort(ordem);
  const liquidadas = totalGreens + totalReds;

  return {
    linhas,
    aguardando,
    total: {
      liquidadas,
      greens: totalGreens,
      reds: totalReds,
      acerto: liquidadas ? umaCasa((totalGreens / liquidadas) * 100) : null,
      brier: todosBriers.length
        ? Math.round((todosBriers.reduce((s, x) => s + x, 0) / todosBriers.length) * 1000) / 1000
        : null,
      roi: totalComOdd ? umaCasa((totalLucro / totalComOdd) * 100) : null,
      lucro: Math.round(totalLucro * 1000) / 1000,
      ligas: ligas.size,
      mercados: mercados.size,
      paresProntos: linhas.length,
      paresAguardando: aguardando.length,
    },
    minAmostra: MIN_AMOSTRA,
    semLiga,
  };
}
