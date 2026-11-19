/**
 * Player Props — motor matemático (PURO: sem rede, sem banco).
 *
 * Ideia: para cada jogador, pegamos os últimos N jogos (do mais antigo para o
 * mais recente), damos mais peso aos recentes e estimamos a média (`lambda`).
 * Com Poisson, calculamos P(X > linha) do mercado — cartões, finalizações,
 * chutes no gol, defesas, gols, assistências e faltas.
 *
 * Quando existe H2H (o mesmo jogador contra aquele adversário), a média do
 * confronto entra como blend: `media = (1-w)·media10 + w·mediaH2H`.
 */

export type StatKey =
  | "gols"
  | "assistencias"
  | "finalizacoes"
  | "chutesNoGol"
  | "faltasCometidas"
  | "faltasSofridas"
  | "cartoes"
  | "defesas";

export const STAT_LABEL: Record<StatKey, string> = {
  gols: "Gols",
  assistencias: "Assistências",
  finalizacoes: "Finalizações",
  chutesNoGol: "Chutes no gol",
  faltasCometidas: "Faltas cometidas",
  faltasSofridas: "Faltas sofridas",
  cartoes: "Cartões",
  defesas: "Defesas (GK)",
};

/** Valores de UM jogo (só as estatísticas disponíveis naquele jogo). */
export type JogoValores = Partial<Record<StatKey, number>>;

export type JogadorAmostra = {
  id: string;
  nome: string;
  time: string;
  timeId?: string;
  lado: "home" | "away";
  posicao: string;
  /** Mais antigo → mais recente. */
  jogos: JogoValores[];
};

export type Mercado = {
  id: string;
  rotulo: string;
  stat: StatKey;
  linha: number;
  /** Posições elegíveis (ex.: defesas só para goleiros). */
  posicoes?: string[];
  ordem: number;
};

export const MERCADOS: Mercado[] = [
  { id: "cartoes", rotulo: "Cartões", stat: "cartoes", linha: 0.5, ordem: 1 },
  { id: "finalizacoes", rotulo: "Finalizações", stat: "finalizacoes", linha: 1.5, ordem: 2 },
  { id: "chutes_no_gol", rotulo: "Chutes no gol", stat: "chutesNoGol", linha: 0.5, ordem: 3 },
  { id: "faltas_sofridas", rotulo: "Faltas sofridas", stat: "faltasSofridas", linha: 1.5, ordem: 4 },
  { id: "faltas_cometidas", rotulo: "Faltas cometidas", stat: "faltasCometidas", linha: 1.5, ordem: 5 },
  { id: "gols", rotulo: "Gols", stat: "gols", linha: 0.5, ordem: 6 },
  { id: "assistencias", rotulo: "Assistências", stat: "assistencias", linha: 0.5, ordem: 7 },
  { id: "defesas", rotulo: "Defesas (goleiro)", stat: "defesas", linha: 2.5, posicoes: ["G"], ordem: 8 },
];

/** Pesos lineares crescentes (1..n): o jogo mais recente pesa `n` vezes o 1º. */
export function pesosRecencia(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i + 1);
}

/** Média ponderada; ignora `null`/`undefined` (jogo sem o dado). */
export function mediaPonderada(valores: (number | null | undefined)[], pesos?: number[]): number | null {
  let soma = 0;
  let somaPeso = 0;
  for (let i = 0; i < valores.length; i++) {
    const v = valores[i];
    if (v == null || !Number.isFinite(v)) continue;
    const w = pesos?.[i] ?? 1;
    soma += v * w;
    somaPeso += w;
  }
  return somaPeso > 0 ? soma / somaPeso : null;
}

/** Fatorial iterativo para a soma de Poisson (linhas pequenas). */
function fatorial(k: number): number {
  let f = 1;
  for (let i = 2; i <= k; i++) f *= i;
  return f;
}

/** P(X ≤ k) para X ~ Poisson(lambda). */
export function poissonAcumulado(lambda: number, k: number): number {
  if (lambda <= 0) return k >= 0 ? 1 : 0;
  let soma = 0;
  for (let i = 0; i <= Math.max(0, Math.floor(k)); i++) {
    soma += (Math.exp(-lambda) * Math.pow(lambda, i)) / fatorial(i);
  }
  return Math.min(1, Math.max(0, soma));
}

/** P(X > linha) — o "Over" de uma linha .5, 1.5, 2.5… */
export function poissonOver(lambda: number, linha: number): number {
  return Math.min(1, Math.max(0, 1 - poissonAcumulado(lambda, Math.floor(linha))));
}

/** P(X < linha) — o "Under" da mesma linha. */
export function poissonUnder(lambda: number, linha: number): number {
  return Math.min(1, Math.max(0, poissonAcumulado(lambda, Math.ceil(linha) - 1)));
}

/** Coeficiente de variação (dispersão relativa). */
export function coefVariacao(valores: number[], media: number): number {
  const limpos = valores.filter((v) => Number.isFinite(v));
  if (limpos.length < 2 || media <= 0) return 1;
  const variancia = limpos.reduce((s, v) => s + (v - media) ** 2, 0) / limpos.length;
  return Math.sqrt(variancia) / media;
}

export type PropCalculada = {
  jogadorId: string;
  nome: string;
  time: string;
  lado: "home" | "away";
  posicao: string;
  stat: StatKey;
  linha: number;
  /** Média dos últimos jogos (ponderada). */
  media: number | null;
  /** Média usada no Poisson (com blend H2H, quando existe). */
  lambda: number | null;
  mediaH2H: number | null;
  probOver: number;
  probUnder: number;
  amostra: number;
  desvio: number;
  /** 0..1 — tamanho da amostra + consistência. */
  confianca: number;
};

export const PESO_H2H = 0.3;
/** Amostra mínima para um prop ser exibido. */
export const MIN_AMOSTRA = 3;
/** Probabilidade mínima para entrar nos cards (evita "0%" como sugestão). */
export const MIN_PROB = 0.2;

/**
 * Calcula um prop para um jogador/mercado.
 * `h2h` = valores do jogador nos jogos contra este adversário (opcional).
 */
export function calcularProp(
  jogador: JogadorAmostra,
  mercado: Mercado,
  h2h: (number | null | undefined)[] = [],
): PropCalculada | null {
  if (mercado.posicoes && !mercado.posicoes.includes(jogador.posicao)) return null;

  const valores = jogador.jogos.map((j) => j[mercado.stat] ?? null);
  const pesos = pesosRecencia(valores.length);
  const media = mediaPonderada(valores, pesos);
  if (media == null) return null;

  const disponiveis = valores.filter((v): v is number => v != null && Number.isFinite(v));
  const amostra = disponiveis.length;
  if (amostra < MIN_AMOSTRA) return null;

  const mediaH2H = h2h.length ? mediaPonderada(h2h, pesosRecencia(h2h.length)) : null;
  const lambda = mediaH2H == null ? media : media * (1 - PESO_H2H) + mediaH2H * PESO_H2H;

  const cv = coefVariacao(disponiveis, media);
  const fatorAmostra = Math.min(1, amostra / 8);
  const fatorConsistencia = 1 / (1 + cv);
  const confianca = Math.min(0.99, Math.max(0.05, 0.65 * fatorAmostra + 0.35 * fatorConsistencia));

  return {
    jogadorId: jogador.id,
    nome: jogador.nome,
    time: jogador.time,
    lado: jogador.lado,
    posicao: jogador.posicao,
    stat: mercado.stat,
    linha: mercado.linha,
    media: +media.toFixed(3),
    lambda: +lambda.toFixed(3),
    mediaH2H: mediaH2H == null ? null : +mediaH2H.toFixed(3),
    probOver: poissonOver(lambda, mercado.linha),
    probUnder: poissonUnder(lambda, mercado.linha),
    amostra,
    desvio: +cv.toFixed(3),
    confianca: +confianca.toFixed(3),
  };
}

/** Top N do mercado, do maior probOver para o menor. */
export function topDoMercado(
  jogadores: JogadorAmostra[],
  mercado: Mercado,
  h2hPorJogador: Record<string, (number | null | undefined)[]> = {},
  n = 3,
  /** Piso de probabilidade para o card não exibir 0% como sugestão. */
  minProb = MIN_PROB,
): PropCalculada[] {
  return jogadores
    .map((j) => calcularProp(j, mercado, h2hPorJogador[j.id] ?? []))
    .filter((p): p is PropCalculada => p != null && p.probOver >= minProb)
    .sort((a, b) => b.probOver - a.probOver)
    .slice(0, n);
}

/** Cards de mercado com o Top 3 pronto para a UI. */
export function montarCards(
  jogadores: JogadorAmostra[],
  h2hPorJogador: Record<string, (number | null | undefined)[]> = {},
  n = 3,
) {
  return MERCADOS.map((m) => ({
    mercado: m,
    top: topDoMercado(jogadores, m, h2hPorJogador, n),
  })).filter((c) => c.top.length > 0);
}