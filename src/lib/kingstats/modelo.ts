/**
 * Modelo de oportunidades do módulo King STATS.
 *
 * O site original seleciona as "oportunidades do dia" com critérios próprios
 * que NÃO estão no bundle público (ficam no servidor / área paga). Não tento
 * copiar a fórmula deles — seria adivinhação. Em vez disso, aplico um modelo
 * Poisson transparente sobre os MESMOS dados que o site entrega (histórico de
 * cada equipe), com limiares explícitos. Tudo aqui é auditável.
 *
 * Entradas: gols pró/contra por mando de cada equipe.
 * Saídas: probabilidade por mercado + odd justa (1/prob). A odd justa NÃO é a
 * cotação de uma casa; serve de referência para o usuário comparar.
 */
import { poissonSF } from "@/lib/apitou/engine";
import { resumirEquipe, ultimas, type Jogo, type Partida, type StatsJogo } from "@/lib/kingstats";

/** Média de gols por equipe, por partida. Usada como "prior" para amostra curta. */
const PRIOR_GOLS = 1.3;
/** Peso do prior: com 3 partidas, metade do valor vem da média geral. */
const PESO_PRIOR = 3;
/** Gols de 1º tempo ≈ 45% dos gols do jogo (proporção histórica usual). */
const FRACAO_HT = 0.45;

export type Categoria = "ft" | "ht" | "btts";

export type Oportunidade = {
  jogoId: string;
  home: string;
  away: string;
  liga: string;
  kickoff: string; // unix segundos (string, como vem da fonte)
  categoria: Categoria;
  mercado: string;
  prob: number; // 0..1
  /** Odd justa = 1/prob. Referência, não cotação de casa. */
  oddJusta: number;
  lambdaTotal: number;
  lambdaCasa: number;
  lambdaFora: number;
  /** 0..1 — quão sólida é a amostra usada (limitada por nº de jogos). */
  confianca: number;
  /** n de partidas consideradas em cada lado. */
  nCasa: number;
  nFora: number;
  formCasa: string;
  formFora: string;
};

type Lado = { para: number; contra: number; n: number; porMando: boolean };

/** Média de gols pró/contra, preferindo o recorte por mando quando há amostra. */
function lado(partidas: Partida[], mando: "home" | "away", n = 10): Lado {
  const porMando = ultimas(partidas, mando, n);
  const usar = porMando.length >= 3 ? porMando : ultimas(partidas, "all", n);
  const r = resumirEquipe(usar);
  return { para: r.avgFor, contra: r.avgAgainst, n: r.n, porMando: porMando.length >= 3 };
}

/** Encolhe a média em direção ao prior — protege contra amostras de 1-2 jogos. */
function suave(media: number, n: number): number {
  return (media * n + PRIOR_GOLS * PESO_PRIOR) / (n + PESO_PRIOR);
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export type ModeloJogo = {
  lambdaCasa: number;
  lambdaFora: number;
  lambdaTotal: number;
  prob: {
    over15: number;
    over25: number;
    over35: number;
    btts: number;
    over05ht: number;
  };
  confianca: number;
  nCasa: number;
  nFora: number;
  formCasa: string;
  formFora: string;
};

/** Calcula o modelo Poisson de um jogo a partir do histórico de cada lado. */
export function modelarJogo(stats: StatsJogo): ModeloJogo | null {
  if (!stats?.home?.length || !stats?.away?.length) return null;

  const casa = lado(stats.home, "home");
  const fora = lado(stats.away, "away");
  if (casa.n === 0 || fora.n === 0) return null;

  // λ de cada lado = média entre "ataque próprio" e "defesa do adversário".
  const lambdaCasa = clamp((suave(casa.para, casa.n) + suave(fora.contra, fora.n)) / 2, 0.2, 4.5);
  const lambdaFora = clamp((suave(fora.para, fora.n) + suave(casa.contra, casa.n)) / 2, 0.2, 4.5);
  const lambdaTotal = lambdaCasa + lambdaFora;

  // BTTS = P(casa marca) × P(fora marca), assumindo independência entre os lados.
  const pCasaMarca = 1 - Math.exp(-lambdaCasa);
  const pForaMarca = 1 - Math.exp(-lambdaFora);

  // Confiança combina tamanho de amostra e uso do recorte por mando.
  const base = Math.min(casa.n, fora.n) / 10;
  const bonusMando = (casa.porMando ? 0.1 : 0) + (fora.porMando ? 0.1 : 0);
  const confianca = clamp(base + bonusMando, 0.15, 1);

  return {
    lambdaCasa,
    lambdaFora,
    lambdaTotal,
    prob: {
      over15: poissonSF(1, lambdaTotal),
      over25: poissonSF(2, lambdaTotal),
      over35: poissonSF(3, lambdaTotal),
      btts: pCasaMarca * pForaMarca,
      over05ht: poissonSF(0, lambdaTotal * FRACAO_HT),
    },
    confianca,
    nCasa: casa.n,
    nFora: fora.n,
    formCasa: resumirEquipe(ultimas(stats.home, "all", 5)).form.join(""),
    formFora: resumirEquipe(ultimas(stats.away, "all", 5)).form.join(""),
  };
}

/**
 * Faixa de probabilidade em que vale a pena recomendar.
 *
 * Por quê uma FAIXA e não "o maior percentual": o mercado mais provável de todos
 * costuma ser "Over 0.5 HT" com 85% — odd justa 1.16 e quase nenhum valor. O
 * King original recomenda mercados com odd ~2 (probabilidade ~50%). Então
 * exigimos que a odd justa fique entre 1.35 e 2.20 (prob 45%–74%). Isso descarta
 * tanto o "quase certo" quanto o "milagre", e sobra o que é apostável.
 */
const PROB_MIN = 0.45;
const PROB_MAX = 0.74;

type Candidato = { mercado: string; categoria: Categoria; prob: number };

/**
 * Escolhe a oportunidade de um jogo: dentro da faixa de valor, o mercado com a
 * MAIOR probabilidade. Jogos em que nenhum mercado cai na faixa retornam null —
 * nem todo jogo é oportunidade, e é isso que o nome "critérios" do site sugere.
 */
export function oportunidadeDoJogo(jogo: Jogo, stats: StatsJogo): Oportunidade | null {
  const m = modelarJogo(stats);
  if (!m) return null;

  const candidatos: Candidato[] = [
    { mercado: "Over 1.5", categoria: "ft", prob: m.prob.over15 },
    { mercado: "Over 2.5", categoria: "ft", prob: m.prob.over25 },
    { mercado: "Over 3.5", categoria: "ft", prob: m.prob.over35 },
    { mercado: "Ambas marcam", categoria: "btts", prob: m.prob.btts },
    { mercado: "Over 0.5 HT", categoria: "ht", prob: m.prob.over05ht },
  ];

  let melhor: Candidato | null = null;
  for (const c of candidatos) {
    if (c.prob < PROB_MIN || c.prob > PROB_MAX) continue;
    if (!melhor || c.prob > melhor.prob) melhor = c;
  }
  if (!melhor) return null;

  return {
    jogoId: jogo.id,
    home: jogo.home.name,
    away: jogo.away.name,
    liga: jogo.league?.name ?? "",
    kickoff: jogo.time,
    categoria: melhor.categoria,
    mercado: melhor.mercado,
    prob: melhor.prob,
    oddJusta: melhor.prob > 0 ? 1 / melhor.prob : 0,
    lambdaTotal: m.lambdaTotal,
    lambdaCasa: m.lambdaCasa,
    lambdaFora: m.lambdaFora,
    confianca: m.confianca,
    nCasa: m.nCasa,
    nFora: m.nFora,
    formCasa: m.formCasa,
    formFora: m.formFora,
  };
}

/**
 * Gera a lista de oportunidades de um dia, ordenada por força.
 * `forca = prob × confiança` — evita colocar no topo um jogo com 1 partida de histórico.
 */
export function montarOportunidades(
  jogos: Jogo[],
  stats: Record<string, StatsJogo>,
): Oportunidade[] {
  const saida: Oportunidade[] = [];
  for (const j of jogos) {
    const s = stats[j.id];
    if (!s) continue;
    const o = oportunidadeDoJogo(j, s);
    if (o) saida.push(o);
  }
  return saida.sort((a, b) => b.prob * b.confianca - a.prob * a.confianca);
}
