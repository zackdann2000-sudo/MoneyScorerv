/**
 * SCREENER AVANÇADO — motor PURO de "quem bate este filtro no histórico".
 *
 * A pergunta: "nos últimos N jogos deste jogador/time, em quantos ele passou da
 * linha que eu escolhi, e isso bate minha taxa mínima?" A resposta é sempre a
 * FREQUÊNCIA observada — não é probabilidade, não é odd, não é previsão. Quem lê
 * "7 de 10" está vendo o passado, não uma promessa sobre o próximo jogo.
 *
 * Regras herdadas do resto do produto:
 *   • `null`/ausente NUNCA entra na conta como zero (o jogador pode não ter
 *     recebido a estatística naquele jogo — inventar 0 acusa ele de graça).
 *   • Amostra abaixo de MIN_AMOSTRA ⇒ o candidato some do resultado, em vez de
 *     aparecer com "100%" em 1 jogo.
 *   • Sem banco, sem rede, sem `Date.now()`: entra e sai por parâmetro.
 */

import type { HistGame } from "./espn";
import type { JogoValores, StatKey } from "./playerPropsEngine";

/** Janelas aceitas (as mesmas da UI). */
export const JANELAS = [3, 5, 10] as const;
export type Janela = (typeof JANELAS)[number];

/** Jogos com dado necessários para publicar uma taxa. */
export const MIN_AMOSTRA = 3;

/** Taxa mínima padrão e faixa aceita. */
export const TAXA_PADRAO = 70;
export const TAXA_MIN = 50;
export const TAXA_MAX = 100;

/** Teto da linha (evita consulta sem sentido e protege o render). */
export const LINHA_MAX = 50;

export type Entidade = "jogador" | "time";
export type Condicao = "pelo_menos" | "abaixo";

export type MetricaScreener = {
  id: string;
  entidade: Entidade;
  label: string;
  /** O que está sendo contado, em uma linha (vai no card e no rodapé). */
  criterio: string;
  /** Linha sugerida ao trocar de métrica. */
  linhaPadrao: number;
  /** Passo do campo de linha (0,5 para contagens, 1 para percentuais). */
  passo: number;
  /**
   * Custo da coleta (só métricas de time):
   *  A = sai do calendário do time (1 request) · B = exige o resumo de cada jogo.
   */
  etapa?: "A" | "B";
  /** Jogador: qual estatística do histórico de props. */
  stat?: StatKey;
  /** Time: como tirar o valor de um jogo do histórico (null = sem dado). */
  valorTime?: (g: HistGame) => number | null;
};

/* ============================ MÉTRICAS ============================ */

const N = (v: number | null | undefined): number | null =>
  v == null || !Number.isFinite(Number(v)) ? null : Number(v);

/** Cartões do time no jogo (amarelo + vermelho); null quando nenhum dos dois veio. */
const cartoesTime = (g: HistGame): number | null => {
  if (g.yellow == null && g.red == null) return null;
  return (g.yellow ?? 0) + (g.red ?? 0);
};

/** Gols do 1º tempo no jogo inteiro; null quando o linescore não veio. */
const gols1Tempo = (g: HistGame): number | null =>
  g.htGf == null || g.htGa == null ? null : g.htGf + g.htGa;

export const METRICAS: MetricaScreener[] = [
  /* ---------- JOGADOR ---------- */
  { id: "j_passes", entidade: "jogador", label: "Passes", criterio: "passes totais por jogo", linhaPadrao: 29.5, passo: 1, stat: "passes" },
  { id: "j_passes_certos", entidade: "jogador", label: "Passes certos", criterio: "passes certos por jogo", linhaPadrao: 24.5, passo: 1, stat: "passesCertos" },
  { id: "j_finalizacoes", entidade: "jogador", label: "Finalizações", criterio: "finalizações por jogo", linhaPadrao: 1.5, passo: 0.5, stat: "finalizacoes" },
  { id: "j_chutes_gol", entidade: "jogador", label: "Chutes no gol", criterio: "chutes no gol por jogo", linhaPadrao: 0.5, passo: 0.5, stat: "chutesNoGol" },
  { id: "j_cartoes", entidade: "jogador", label: "Cartões", criterio: "cartões (amarelo + vermelho) por jogo", linhaPadrao: 0.5, passo: 0.5, stat: "cartoes" },
  { id: "j_defesas", entidade: "jogador", label: "Defesas (GK)", criterio: "defesas por jogo (goleiros)", linhaPadrao: 2.5, passo: 0.5, stat: "defesas" },
  { id: "j_gols", entidade: "jogador", label: "Gols", criterio: "gols por jogo", linhaPadrao: 0.5, passo: 0.5, stat: "gols" },
  { id: "j_assistencias", entidade: "jogador", label: "Assistências", criterio: "assistências por jogo", linhaPadrao: 0.5, passo: 0.5, stat: "assistencias" },
  { id: "j_faltas_sofridas", entidade: "jogador", label: "Faltas sofridas", criterio: "faltas sofridas por jogo", linhaPadrao: 1.5, passo: 0.5, stat: "faltasSofridas" },
  { id: "j_faltas_cometidas", entidade: "jogador", label: "Faltas cometidas", criterio: "faltas cometidas por jogo", linhaPadrao: 1.5, passo: 0.5, stat: "faltasCometidas" },

  /* ---------- TIME ---------- */
  { id: "t_gols_marcados", entidade: "time", label: "Gols marcados", criterio: "gols do time por jogo", linhaPadrao: 1.5, passo: 0.5, etapa: "A", valorTime: (g) => N(g.gf) },
  { id: "t_gols_sofridos", entidade: "time", label: "Gols sofridos", criterio: "gols sofridos por jogo", linhaPadrao: 0.5, passo: 0.5, etapa: "A", valorTime: (g) => N(g.ga) },
  { id: "t_gols_jogo", entidade: "time", label: "Gols no jogo", criterio: "total de gols do jogo", linhaPadrao: 2.5, passo: 0.5, etapa: "A", valorTime: (g) => N(g.gf + g.ga) },
  { id: "t_escanteios", entidade: "time", label: "Escanteios do time", criterio: "escanteios do time por jogo", linhaPadrao: 4.5, passo: 0.5, etapa: "B", valorTime: (g) => N(g.corners) },
  { id: "t_cartoes", entidade: "time", label: "Cartões do time", criterio: "cartões do time por jogo", linhaPadrao: 1.5, passo: 0.5, etapa: "B", valorTime: cartoesTime },
  { id: "t_finalizacoes", entidade: "time", label: "Finalizações do time", criterio: "finalizações do time por jogo", linhaPadrao: 9.5, passo: 0.5, etapa: "B", valorTime: (g) => N(g.shots) },
  { id: "t_gols_1t", entidade: "time", label: "Gols no 1º tempo", criterio: "gols do 1º tempo no jogo", linhaPadrao: 0.5, passo: 0.5, etapa: "A", valorTime: gols1Tempo },
  { id: "t_impedimentos", entidade: "time", label: "Impedimentos do time", criterio: "impedimentos do time por jogo", linhaPadrao: 1.5, passo: 0.5, etapa: "B", valorTime: (g) => N(g.offsides) },
];

export const metricasDe = (entidade: Entidade): MetricaScreener[] =>
  METRICAS.filter((m) => m.entidade === entidade);

export const metricaPorId = (id: string): MetricaScreener | null =>
  METRICAS.find((m) => m.id === id) ?? null;

/* ============================ CONSULTA ============================ */

export type Consulta = {
  entidade: Entidade;
  metrica: string;
  condicao: Condicao;
  linha: number;
  janela: Janela;
  taxaMinima: number;
  /** "" ou "all" = todas as ligas principais. */
  liga: string;
};

export type ConsultaNormalizada = Consulta & { def: MetricaScreener };

const numOuNada = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Valida e normaliza o corpo da requisição. Devolve `{ erro }` em vez de lançar —
 * a rota responde 400 com a mensagem exata, sem stack no cliente.
 */
export function normalizarConsulta(
  body: unknown,
): { ok: true; consulta: ConsultaNormalizada } | { ok: false; erro: string } {
  const b = (body ?? {}) as Record<string, unknown>;

  const entidade: Entidade = b.entidade === "time" ? "time" : "jogador";

  const pedida = typeof b.metrica === "string" ? metricaPorId(b.metrica) : null;
  /* Métrica desconhecida ou de outra entidade: cai na primeira da entidade em
     vez de responder erro — a UI já manda ids válidos, e uma métrica trocada
     não pode derrubar a consulta inteira. */
  const def = pedida?.entidade === entidade ? pedida : metricasDe(entidade)[0];

  const condicao: Condicao = b.condicao === "abaixo" ? "abaixo" : "pelo_menos";

  const linhaBruta = numOuNada(b.linha);
  const linha = Math.min(LINHA_MAX, Math.max(0, +(linhaBruta ?? def.linhaPadrao)));

  const janelaBruta = numOuNada(b.janela);
  const janela: Janela = (JANELAS as readonly number[]).includes(janelaBruta ?? NaN)
    ? (janelaBruta as Janela)
    : 5;

  const taxaBruta = numOuNada(b.taxaMinima);
  const taxaMinima = Math.round(Math.min(TAXA_MAX, Math.max(TAXA_MIN, taxaBruta ?? TAXA_PADRAO)));

  const liga = typeof b.liga === "string" && b.liga.trim() ? b.liga.trim() : "all";

  return {
    ok: true,
    consulta: { entidade, metrica: def.id, condicao, linha, janela, taxaMinima, liga, def },
  };
}

/* ============================ AVALIAÇÃO ============================ */

export type Avaliacao = {
  /** Jogos com dado dentro da janela (pode ser < janela). */
  amostra: number;
  acertos: number;
  /** 0–100, arredondado. */
  taxa: number;
  /** 1 = bateu a condição. Cronológico: mais antigo primeiro. */
  serie: (0 | 1)[];
  /** Acertos consecutivos, contando do jogo mais recente para trás. */
  sequencia: number;
  /** Média dos valores observados (o "de onde vem" do card). */
  media: number;
  /** Bateu a taxa mínima pedida. */
  aprovado: boolean;
};

/** A condição foi cumprida neste valor? */
export const passou = (valor: number, condicao: Condicao, linha: number): boolean =>
  condicao === "pelo_menos" ? valor > linha : valor < linha;

/**
 * Avalia uma série de valores (cronológica: mais antigo → mais recente).
 *
 * `null`/`undefined` são pulados, não viram zero. Se sobrar menos que
 * MIN_AMOSTRA jogos com dado, devolve `null` — o candidato não é publicado.
 */
export function avaliarSerie(
  valores: (number | null | undefined)[],
  opts: { condicao: Condicao; linha: number; janela: number; taxaMinima: number },
): Avaliacao | null {
  const janela = Math.max(1, Math.floor(opts.janela));
  const comDado = valores
    .slice(-janela)
    .filter((v): v is number => v != null && Number.isFinite(Number(v)))
    .map(Number);

  if (comDado.length < MIN_AMOSTRA) return null;

  const serie = comDado.map((v) => (passou(v, opts.condicao, opts.linha) ? 1 : 0) as 0 | 1);
  const acertos = serie.reduce<number>((s, v) => s + v, 0);
  const taxa = Math.round((acertos / serie.length) * 100);

  /* Sequência atual: do jogo mais recente para trás, até o primeiro erro. */
  let sequencia = 0;
  for (let i = serie.length - 1; i >= 0 && serie[i] === 1; i--) sequencia++;

  const media = comDado.reduce<number>((s, v) => s + v, 0) / comDado.length;

  return {
    amostra: serie.length,
    acertos,
    taxa,
    serie,
    sequencia,
    media: +media.toFixed(2),
    aprovado: taxa >= opts.taxaMinima,
  };
}

export type Candidato = {
  id: string;
  nome: string;
  /** Time do jogador (entidade jogador) ou liga do time (entidade time). */
  contexto: string;
  /** Posição (jogador) — vazio no time. */
  posicao?: string;
  foto?: string | null;
  avaliacao: Avaliacao;
};

/** Só os que batem a taxa mínima; quem tem sequência maior aparece antes. */
export function filtrarOrdenar(candidatos: Candidato[], taxaMinima: number): Candidato[] {
  return candidatos
    .filter((c) => c.avaliacao.aprovado && c.avaliacao.taxa >= taxaMinima)
    .sort(
      (a, b) =>
        b.avaliacao.taxa - a.avaliacao.taxa ||
        b.avaliacao.sequencia - a.avaliacao.sequencia ||
        b.avaliacao.amostra - a.avaliacao.amostra ||
        a.nome.localeCompare(b.nome),
    );
}

/** Frase curta do filtro, para o cabeçalho do resultado e para o log. */
export function descreverConsulta(c: Consulta & { def?: MetricaScreener }): string {
  const def = c.def ?? metricaPorId(c.metrica);
  const comparador = c.condicao === "pelo_menos" ? "pelo menos" : "abaixo de";
  const alvo = c.entidade === "jogador" ? "jogadores" : "times";
  return `${alvo} com ${def?.label ?? c.metrica} ${comparador} ${c.linha} em ≥${c.taxaMinima}% dos últimos ${c.janela} jogos`;
}
