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

import { getWeightedAverage } from "./formWeight";

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
  /** Foto publicada pelo fornecedor; null quando ele não manda. */
  foto?: string | null;
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

/**
 * Mercados do Top 3 de Player Props.
 *
 * Só estes seis: Assistências, Gols, Finalizações, Cartões, Defesas de Goleiro
 * e Chutes ao Alvo. Faltas (sofridas/cometidas) saíram do card por decisão de
 * produto: poluíam o Top 3 sem aumentar a taxa de acerto. O motor continua
 * sabendo calcular faltas (`StatKey`), só não as publica aqui.
 */
export const MERCADOS: Mercado[] = [
  { id: "assistencias", rotulo: "Assistências", stat: "assistencias", linha: 0.5, ordem: 1 },
  { id: "gols", rotulo: "Gols", stat: "gols", linha: 0.5, ordem: 2 },
  { id: "finalizacoes", rotulo: "Finalizações", stat: "finalizacoes", linha: 1.5, ordem: 3 },
  { id: "cartoes", rotulo: "Cartões", stat: "cartoes", linha: 0.5, ordem: 4 },
  { id: "defesas", rotulo: "Defesas (goleiro)", stat: "defesas", linha: 2.5, posicoes: ["G"], ordem: 5 },
  { id: "chutes_no_gol", rotulo: "Chutes ao alvo", stat: "chutesNoGol", linha: 0.5, ordem: 6 },
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

/* ========================================================================== */
/* DESTAQUES DO CONFRONTO — ranking por média real, sem inventar nada.        */
/* ========================================================================== */

/**
 * Mercados do bloco "Top jogadores por mercado".
 *
 * Diferente de `MERCADOS`, aqui o que importa é a MÉDIA/jogo do jogador na
 * janela real, não a probabilidade de um Over. É o olhar de scout: quem chuta
 * mais, quem toma cartão, quem defende — sempre a partir dos jogos que a fonte
 * devolveu.
 */
export type DestaqueMercado =
  | "gols_assistencias"
  | "cartoes"
  | "finalizacoes"
  | "chutes_no_gol"
  | "defesas";

/** Um jogador já ranqueado, com o que a UI precisa para desenhar o card. */
export type DestaqueJogador = {
  jogadorId: string;
  nome: string;
  time: string;
  lado: "home" | "away";
  posicao: string;
  foto: string | null;
  /** Média ponderada/jogo. `null` = amostra insuficiente (não estimamos). */
  media: number | null;
  /** Jogos da janela em que a fonte publicou ESTA estatística. */
  amostra: number;
  /** Jogos que o jogador tem na janela (mesmo sem o dado do mercado). */
  jogosNaJanela: number;
  /** % dos jogos da amostra em que o evento aconteceu (0..1). */
  frequencia: number | null;
  /** false → a UI mostra "Amostra insuficiente" e esconde a barra. */
  suficiente: boolean;
  /** 0..1 relativo ao líder do card (nunca uma probabilidade inventada). */
  barra: number;
  /** Métrica complementar real (ex.: chutes no gol no card de finalizações). */
  mediaSecundaria?: number | null;
  rotuloSecundaria?: string;
};

export type DestaqueGrupo = {
  id: "gols_assistencias" | "cartoes" | "finalizacoes" | "goleiros";
  rotulo: string;
  icone: string;
  descricao: string;
  /** true = Top N de CADA time; false = Top N do confronto inteiro. */
  porLado: boolean;
  itens: DestaqueJogador[];
};

const normalizaPosicao = (p: string) =>
  String(p || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

/** Goleiro nas nomenclaturas que a fonte costuma mandar (G, GK, Goalkeeper...). */
export function ehGoleiro(posicao: string): boolean {
  const p = normalizaPosicao(posicao);
  return p === "g" || p === "gk" || p === "goalkeeper" || p === "goleiro" || p === "keeper";
}

/** Série do mercado, um valor por jogo (null quando a fonte não publicou). */
function serieDoMercado(jogador: JogadorAmostra, mercado: DestaqueMercado): (number | null)[] {
  if (mercado === "gols_assistencias") {
    return jogador.jogos.map((j) => {
      const gols = j.gols;
      const assists = j.assistencias;
      if (gols == null && assists == null) return null;
      return (gols ?? 0) + (assists ?? 0);
    });
  }
  const stat: StatKey = mercado === "chutes_no_gol" ? "chutesNoGol" : (mercado as StatKey);
  return jogador.jogos.map((j) => (j[stat] == null ? null : Number(j[stat])));
}

function montarDestaque(
  jogador: JogadorAmostra,
  mercado: DestaqueMercado,
  secundario?: DestaqueMercado,
): DestaqueJogador {
  const serie = serieDoMercado(jogador, mercado);
  const validos = serie.filter((v): v is number => v != null && Number.isFinite(v));
  const suficiente = validos.length >= MIN_AMOSTRA;

  // `formWeight` espera a série do jogo MAIS RECENTE para o mais antigo;
  // `jogador.jogos` está em ordem cronológica. Sem inverter, o peso de forma
  // cairia no jogo errado.
  const media = suficiente ? getWeightedAverage([...serie].reverse()) : null;
  const frequencia = suficiente && validos.length > 0 ? validos.filter((v) => v > 0).length / validos.length : null;

  let mediaSecundaria: number | null = null;
  if (secundario) {
    const serieSec = serieDoMercado(jogador, secundario).filter((v): v is number => v != null && Number.isFinite(v));
    if (serieSec.length >= MIN_AMOSTRA) {
      const m = getWeightedAverage([...serieDoMercado(jogador, secundario)].reverse());
      mediaSecundaria = m == null ? null : +m.toFixed(2);
    }
  }

  return {
    jogadorId: jogador.id,
    nome: jogador.nome,
    time: jogador.time,
    lado: jogador.lado,
    posicao: jogador.posicao,
    foto: jogador.foto ?? null,
    media: media == null ? null : +media.toFixed(2),
    amostra: validos.length,
    jogosNaJanela: serie.length,
    frequencia: frequencia == null ? null : +frequencia.toFixed(3),
    suficiente: suficiente && media != null,
    barra: 0,
    mediaSecundaria,
    rotuloSecundaria: secundario === "chutes_no_gol" ? "no gol" : undefined,
  };
}

/** Aplica a barra relativa ao líder, mas SÓ em quem tem amostra suficiente. */
function comBarras(itens: DestaqueJogador[]): DestaqueJogador[] {
  const max = itens.reduce((m, i) => (i.media != null && i.media > m ? i.media : m), 0);
  return itens.map((i) => ({
    ...i,
    barra: i.suficiente && i.media != null && max > 0 ? Math.min(1, i.media / max) : 0,
  }));
}

/** Ranking de um mercado: Top N por lado (casa/fora) ou Top N geral. */
function ranquear(
  jogadores: JogadorAmostra[],
  mercado: DestaqueMercado,
  opts: { porLado: boolean; n: number; secundario?: DestaqueMercado },
): DestaqueJogador[] {
  const ordenar = (lista: JogadorAmostra[]) =>
    lista
      .map((j) => montarDestaque(j, mercado, opts.secundario))
      .filter((d) => d.amostra > 0)
      .sort((a, b) => (b.media ?? -1) - (a.media ?? -1) || b.amostra - a.amostra)
      .slice(0, opts.n);

  const itens = opts.porLado
    ? [...ordenar(jogadores.filter((j) => j.lado === "home")), ...ordenar(jogadores.filter((j) => j.lado === "away"))]
    : ordenar(jogadores);

  return comBarras(itens);
}

/**
 * Goleiro titular provável: quem mais jogos tem na janela. O goleiro reserva
 * que entrou uma vez não vira "titular" por ter média alta num jogo só.
 */
function goleirosDoConfronto(jogadores: JogadorAmostra[]): DestaqueJogador[] {
  const itens: DestaqueJogador[] = [];
  for (const lado of ["home", "away"] as const) {
    const [titular] = jogadores
      .filter((j) => j.lado === lado && ehGoleiro(j.posicao))
      .sort((a, b) => b.jogos.length - a.jogos.length);
    if (!titular) continue;
    const destaque = montarDestaque(titular, "defesas");
    // Sem nenhum jogo do goleiro, não há o que mostrar — nem um zero falso.
    if (destaque.jogosNaJanela === 0) continue;
    itens.push(destaque);
  }
  return comBarras(itens);
}

/**
 * Monta os 4 cards do bloco "Top jogadores por mercado".
 *
 * Regra de honestidade: média só existe com `MIN_AMOSTRA` jogos do dado.
 * Abaixo disso o item aparece com `media: null`/`suficiente: false` e a UI
 * mostra "Amostra insuficiente" — nunca uma média extrapolada.
 */
export function montarDestaques(jogadores: JogadorAmostra[], n = 3): DestaqueGrupo[] {
  return [
    {
      id: "gols_assistencias",
      rotulo: "Gols & Assistências",
      icone: "⚽",
      descricao: `Top ${n} de cada time em participações diretas (gols + assistências) por jogo.`,
      porLado: true,
      itens: ranquear(jogadores, "gols_assistencias", { porLado: true, n }),
    },
    {
      id: "cartoes",
      rotulo: "Cartões",
      icone: "🟨",
      descricao: `Os ${n} mais indisciplinados do confronto (cartões por jogo).`,
      porLado: false,
      itens: ranquear(jogadores, "cartoes", { porLado: false, n }),
    },
    {
      id: "finalizacoes",
      rotulo: "Finalizações & Chutes no gol",
      icone: "🎯",
      descricao: `Os ${n} que mais finalizam por jogo; a linha extra mostra os chutes no gol.`,
      porLado: false,
      itens: ranquear(jogadores, "finalizacoes", { porLado: false, n, secundario: "chutes_no_gol" }),
    },
    {
      id: "goleiros",
      rotulo: "Goleiros (Defesas)",
      icone: "🧤",
      descricao: "Média de defesas por jogo do goleiro titular de cada time.",
      porLado: true,
      itens: goleirosDoConfronto(jogadores),
    },
  ];
}