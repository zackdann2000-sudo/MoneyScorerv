/**
 * Mercados específicos com probabilidade Poisson — módulo PURO.
 *
 * Recebe o histórico recente (últimos 10 jogos) do mandante e do visitante,
 * que a tela de jogo já carrega da ESPN, e devolve a probabilidade REAL de cada
 * mercado pedido. Nada aqui inventa número: quando a fonte não publicou uma
 * coluna (ex.: gols do 1º tempo, escanteios), o mercado volta com `semDados`.
 *
 * Modelo:
 *   gols do mandante ......  λ_casa = (gols feitos casa + gols sofridos fora) / 2
 *   gols do visitante .....  λ_fora = (gols feitos fora + gols sofridos casa) / 2
 *   gols totais ...........  λ_jogo = λ_casa + λ_fora
 *   gols do 1º tempo ......  mesma conta, usando `htGf` / `htGa` (eventos reais)
 *   escanteios do jogo ....  média dos totais por jogo dos dois times
 *   escanteios do 1º tempo   parcela do total do time (ver SHARE_1T_ESCANTEIOS)
 *
 * As médias são ponderadas pela forma recente (1.5 nos 3 últimos jogos, 1.0 do
 * 4º ao 7º e 0.5 do 8º ao 10º) — a mesma régua do resto do app.
 *
 * Sem I/O, sem rede, sem banco: serve para a rota, para a UI e para teste.
 */
import { getWeightedAverage } from "./formWeight";
import { poissonAcima } from "./blocoAnalises";

/** Subconjunto mínimo de um jogo do histórico (HistGame é superconjunto). */
export type JogoMercados = {
  gf: number;
  ga: number;
  htGf?: number | null;
  htGa?: number | null;
  corners?: number | null;
  oppCorners?: number | null;
};

export type GrupoMercado = "gols" | "gols_1t" | "escanteios";

export type MercadoProb = {
  /** chave estável (usada também para casar odd, quando existir) */
  id: string;
  rotulo: string;
  grupo: GrupoMercado;
  /** 0..1 — probabilidade Poisson */
  prob: number | null;
  /** λ usada no Poisson (null quando não há dado) */
  lambda: number | null;
  /** meia-linha do mercado */
  linha: number;
  /** jogos que entraram na conta (menor amostra das séries usadas) */
  amostra: number;
  semDados: boolean;
  /**
   * `true` quando a métrica é derivada (ex.: escanteios do 1º tempo a partir do
   * total). A UI mostra "estimado" para o usuário saber que não é medido.
   */
  estimado?: boolean;
  /** texto curto explicando a base do número */
  detalhe: string;
};

/**
 * Parcela dos escanteios que cai no 1º tempo.
 *
 * A ESPN entrega SÓ o total por jogo — não há coluna de escanteios por tempo no
 * histórico. Usar metade do total como proxy é a divisão mais neutra possível;
 * o card marca o mercado como "estimado" para não vender precisão que a fonte
 * não tem.
 */
export const SHARE_1T_ESCANTEIOS = 0.5;

/** Piso de probabilidade do Radar de Oportunidades. */
export const PISO_PROB_MERCADO = 0.7;

const num = (v: unknown): number | null => {
  const n = Number(v);
  return v == null || !Number.isFinite(n) ? null : n;
};

/** Média ponderada pela forma recente sobre a série (aceita null). */
function media(games: JogoMercados[], pick: (g: JogoMercados) => number | null): number | null {
  if (!games?.length) return null;
  return getWeightedAverage(games.map((g) => pick(g)));
}

/** Quantos jogos da série têm o dado. */
function amostra(games: JogoMercados[], pick: (g: JogoMercados) => number | null): number {
  return (games || []).filter((g) => num(pick(g)) != null).length;
}

const arred = (v: number): number => Math.round(v * 10000) / 10000;

function mercado(
  id: string,
  rotulo: string,
  grupo: GrupoMercado,
  prob: number | null,
  lambda: number | null,
  linha: number,
  n: number,
  detalhe: string,
  estimado = false,
): MercadoProb {
  return {
    id,
    rotulo,
    grupo,
    prob: prob == null ? null : arred(prob),
    lambda: lambda == null ? null : arred(lambda),
    linha,
    amostra: n,
    semDados: prob == null,
    estimado: estimado || undefined,
    detalhe,
  };
}

/** Probabilidade de pelo menos 1 evento (Over 0.5) numa Poisson(λ). */
function peloMenosUm(lambda: number | null): number | null {
  if (lambda == null || !(lambda > 0)) return lambda === 0 ? 0 : null;
  return 1 - Math.exp(-lambda);
}

/**
 * Todos os mercados pedidos, na ordem de exibição.
 *
 * Devolve também os que ficaram sem dado (`semDados: true`), para a UI poder
 * dizer "sem dados" em vez de simplesmente sumir com o mercado.
 */
export function mercadosDoJogo(
  casa: JogoMercados[] | null | undefined,
  fora: JogoMercados[] | null | undefined,
): MercadoProb[] {
  const c = casa ?? [];
  const f = fora ?? [];

  const gfCasa = media(c, (g) => num(g.gf));
  const gaCasa = media(c, (g) => num(g.ga));
  const gfFora = media(f, (g) => num(g.gf));
  const gaFora = media(f, (g) => num(g.ga));

  const lambdaCasa =
    gfCasa != null && gaFora != null ? (gfCasa + gaFora) / 2 : null;
  const lambdaFora =
    gfFora != null && gaCasa != null ? (gfFora + gaCasa) / 2 : null;
  const lambdaJogo =
    lambdaCasa != null && lambdaFora != null ? lambdaCasa + lambdaFora : null;

  const nGols = Math.min(
    amostra(c, (g) => num(g.gf)),
    amostra(c, (g) => num(g.ga)),
    amostra(f, (g) => num(g.gf)),
    amostra(f, (g) => num(g.ga)),
  );

  // ---------------------------------------------------------------- gols
  const btts =
    lambdaCasa != null && lambdaFora != null
      ? (1 - Math.exp(-lambdaCasa)) * (1 - Math.exp(-lambdaFora))
      : null;

  const over15Jogo = lambdaJogo != null ? poissonAcima(1.5, lambdaJogo) : null;
  const over15Casa = lambdaCasa != null ? poissonAcima(1.5, lambdaCasa) : null;
  const over15Fora = lambdaFora != null ? poissonAcima(1.5, lambdaFora) : null;

  // ------------------------------------------------------- 1º tempo (gols)
  const htGfCasa = media(c, (g) => num(g.htGf));
  const htGaCasa = media(c, (g) => num(g.htGa));
  const htGfFora = media(f, (g) => num(g.htGf));
  const htGaFora = media(f, (g) => num(g.htGa));

  const lambdaHtCasa =
    htGfCasa != null && htGaFora != null ? (htGfCasa + htGaFora) / 2 : null;
  const lambdaHtFora =
    htGfFora != null && htGaCasa != null ? (htGfFora + htGaCasa) / 2 : null;
  const nHt = Math.max(
    Math.min(amostra(c, (g) => num(g.htGf)), amostra(f, (g) => num(g.htGa))),
    Math.min(amostra(f, (g) => num(g.htGf)), amostra(c, (g) => num(g.htGa))),
  );

  // ------------------------------------------------------------- escanteios
  const ownCornersCasa = media(c, (g) => num(g.corners));
  const ownCornersFora = media(f, (g) => num(g.corners));
  const totalCornersCasa = media(c, (g) => {
    const own = num(g.corners);
    const opp = num(g.oppCorners);
    return own == null && opp == null ? null : (own ?? 0) + (opp ?? 0);
  });
  const totalCornersFora = media(f, (g) => {
    const own = num(g.corners);
    const opp = num(g.oppCorners);
    return own == null && opp == null ? null : (own ?? 0) + (opp ?? 0);
  });
  const lambdaCornersJogo =
    totalCornersCasa != null && totalCornersFora != null
      ? (totalCornersCasa + totalCornersFora) / 2
      : totalCornersCasa ?? totalCornersFora;

  const lambdaHtCornersCasa =
    ownCornersCasa != null ? ownCornersCasa * SHARE_1T_ESCANTEIOS : null;
  const lambdaHtCornersFora =
    ownCornersFora != null ? ownCornersFora * SHARE_1T_ESCANTEIOS : null;

  const nCorners = Math.max(
    amostra(c, (g) => num(g.corners)),
    amostra(f, (g) => num(g.corners)),
  );

  return [
    mercado(
      "btts",
      "Ambas as equipes marcam (BTTS)",
      "gols",
      btts,
      lambdaJogo,
      0,
      nGols,
      `λ casa ${lambdaCasa?.toFixed(2) ?? "—"} · λ fora ${lambdaFora?.toFixed(2) ?? "—"}`,
    ),
    mercado(
      "ht_fora_05",
      "1º tempo: 0.5+ gols do visitante",
      "gols_1t",
      peloMenosUm(lambdaHtFora),
      lambdaHtFora,
      0.5,
      nHt,
      `média de gols do visitante no 1º tempo`,
    ),
    mercado(
      "ht_casa_05",
      "1º tempo: 0.5+ gols do mandante",
      "gols_1t",
      peloMenosUm(lambdaHtCasa),
      lambdaHtCasa,
      0.5,
      nHt,
      `média de gols do mandante no 1º tempo`,
    ),
    mercado(
      "over15_jogo",
      "1.5+ gols na partida",
      "gols",
      over15Jogo,
      lambdaJogo,
      1.5,
      nGols,
      `λ do jogo ${lambdaJogo?.toFixed(2) ?? "—"}`,
    ),
    mercado(
      "over15_fora",
      "1.5+ gols do visitante",
      "gols",
      over15Fora,
      lambdaFora,
      1.5,
      nGols,
      `λ do visitante ${lambdaFora?.toFixed(2) ?? "—"}`,
    ),
    mercado(
      "over15_casa",
      "1.5+ gols do mandante",
      "gols",
      over15Casa,
      lambdaCasa,
      1.5,
      nGols,
      `λ do mandante ${lambdaCasa?.toFixed(2) ?? "—"}`,
    ),
    mercado(
      "ht_esc_fora_45",
      "1º tempo: 4.5+ escanteios do visitante",
      "escanteios",
      lambdaHtCornersFora != null ? poissonAcima(4.5, lambdaHtCornersFora) : null,
      lambdaHtCornersFora,
      4.5,
      nCorners,
      `total do jogo × ${SHARE_1T_ESCANTEIOS} (1º tempo estimado)`,
      true,
    ),
    mercado(
      "ht_esc_casa_45",
      "1º tempo: 4.5+ escanteios do mandante",
      "escanteios",
      lambdaHtCornersCasa != null ? poissonAcima(4.5, lambdaHtCornersCasa) : null,
      lambdaHtCornersCasa,
      4.5,
      nCorners,
      `total do jogo × ${SHARE_1T_ESCANTEIOS} (1º tempo estimado)`,
      true,
    ),
    mercado(
      "escanteios_jogo_85",
      "8.5+ escanteios no jogo",
      "escanteios",
      lambdaCornersJogo != null ? poissonAcima(8.5, lambdaCornersJogo) : null,
      lambdaCornersJogo,
      8.5,
      nCorners,
      `λ de escanteios ${lambdaCornersJogo?.toFixed(2) ?? "—"}`,
    ),
  ];
}

/** EV em %: (prob × odd) − 1. */
export function evPct(prob: number, odd: number): number {
  if (!(prob > 0) || !(odd > 1)) return 0;
  return (prob * odd - 1) * 100;
}

/**
 * Radar: só as melhores oportunidades.
 *
 * Entra no radar o mercado com probabilidade > 70% OU com EV positivo, quando
 * existe odd de mercado para ele (`odds[id]`). Sem odd não há EV — e o mercado
 * volta a depender só da probabilidade, que é o número que temos de verdade.
 */
export function filtrarMelhores(
  mercados: MercadoProb[],
  odds: Partial<Record<string, number | null>> = {},
): MercadoProb[] {
  return mercados.filter((m) => {
    if (m.prob == null) return false;
    if (m.prob >= PISO_PROB_MERCADO) return true;
    const odd = num(odds[m.id]);
    return odd != null && evPct(m.prob, odd) > 0;
  });
}
