/**
 * Value Bet / Oportunidades de Valor — motor analítico (orquestração de I/O).
 *
 * Cruza a probabilidade REAL do evento (Poisson/Dixon-Coles + forma recente
 * ponderada dos últimos 10 jogos + ajuste H2H) com a probabilidade IMPLÍCITA
 * da odd de mercado (1/odd). Quando o modelo enxerga mais chance do que a odd
 * paga, existe valor esperado positivo — a "oportunidade de valor".
 *
 * A DECISÃO (filtros de prob/odd/edge) fica em `valueBet.ts` (puro, sem rede).
 * Aqui só buscamos os dados reais (ESPN + H2H + odds de mercado via
 * API-Football/ESPN) e chamamos o núcleo.
 */
import {
  getAllMatches,
  getTeamHistory,
  getSummaryRaw,
  normOdds,
  normH2H,
  leagueInfo,
  type Match,
} from "@/lib/espn";
import { runModel, type Analysis } from "@/lib/model";
import { oddsDoJogoComFallback } from "@/lib/providers";
import { getXgOficial, getXgOficialCache } from "@/lib/xgOfficial";
import {
  avaliarOportunidades,
  calcularKelly,
  stakeSugerida,
  MIN_PROB,
  ODD_MIN,
  ODD_MAX,
  KELLY_CAP,
  type Confianca,
  type MercadoValor,
  type MetaJogo,
  type ModelProbs,
  type OddsMercado,
  type OportunidadeValor,
} from "@/lib/valueBet";

// Reexporta o núcleo puro para quem já importa daqui.
export { avaliarOportunidades, calcularKelly, stakeSugerida, MIN_PROB, ODD_MIN, ODD_MAX, KELLY_CAP };
export type { Confianca, MercadoValor, MetaJogo, ModelProbs, OddsMercado, OportunidadeValor };

export type AnaliseJogo = MetaJogo & {
  probs: ModelProbs;
  lambdaHome: number;
  lambdaAway: number;
  /** xG médio por time usado no λ (null sem xG) + cobertura da janela. */
  xgHome: number | null;
  xgAway: number | null;
  xgCoverage: number;
  /** Origem do xG usado no blend: oficial (API-Football) ou estimado (ESPN). */
  xgFonte: "api-football" | "espn" | null;
  /** Mercados extras (cartões/escanteios) calculados pelo modelo. */
  extras: Analysis["extras"];
  topScores: Analysis["topScores"];
  confianca: Confianca;
  h2hAjuste: Analysis["h2hAjuste"];
  /** Confrontos diretos reais (placar) usados pelo motor H2H. */
  h2h: { golsCasa: number; golsFora: number; data?: string }[];
  odds: OddsMercado | null;
  fonteOdd: string;
  oportunidades: OportunidadeValor[];
};

export type OportunidadesResult = {
  geradoEm: string;
  fonte: string;
  analisados: AnaliseJogo[];
  oportunidades: OportunidadeValor[];
};

export type OportunidadesOpts = {
  date?: string;
  minProb?: number;
  oddMin?: number;
  oddMax?: number;
  limit?: number;
  maxMatches?: number;
  principais?: boolean;
  usarApiFootball?: boolean;
  /** Quantos jogos (top por valor) podem gastar chamada real de xG na API-Football. */
  maxXgApi?: number;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

function hojeSP(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
function horaSP(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

async function analisarJogo(
  m: Match,
  opts: Required<Pick<OportunidadesOpts, "minProb" | "oddMin" | "oddMax" | "usarApiFootball">> & {
    /** "api" = pode chamar a API-Football; "cache" = só cache do Neon; "off" = desligado. */
    xgModo: "api" | "cache" | "off";
  },
): Promise<AnaliseJogo | null> {
  const [hh, ah] = await Promise.all([
    getTeamHistory(m.league, m.home.id, 10).catch(() => null),
    getTeamHistory(m.league, m.away.id, 10).catch(() => null),
  ]);
  if (!hh || !ah) return null;

  /* xG OFICIAL (API-Football) com cache 24h no Neon. Quando vem, é anexado ao
     histórico e o motor mescla 50% gols + 50% xG oficial. Falhou (time não
     achado / cota) → segue com o xG estimado da ESPN que já vem no histórico. */
  if (opts.xgModo !== "off" && process.env.XG_OFICIAL_DISABLED !== "1") {
    const buscar = opts.xgModo === "api" ? getXgOficial : getXgOficialCache;
    const [xgH, xgA] = await Promise.all([
      buscar(m.home.name).catch(() => null),
      buscar(m.away.name).catch(() => null),
    ]);
    if (xgH) hh.games.forEach((g) => { g.xgF = xgH.xgFor; g.xgA = xgH.xgAgainst; g.xgFonte = "api-football"; });
    if (xgA) ah.games.forEach((g) => { g.xgF = xgA.xgFor; g.xgA = xgA.xgAgainst; g.xgFonte = "api-football"; });
  }

  // Uma chamada de resumo dá odds (normOdds) e H2H (normH2H) de uma vez.
  const sm = await getSummaryRaw(m.league, m.id, m.state).catch(() => null);
  const h2h = sm ? normH2H(sm) : { games: [] as any[] };
  const model = runModel(m.home.name, m.away.name, hh.games, ah.games, 2.65, { games: h2h.games });
  if (model.status !== "ok" || !model.probs) return null;

  const espnOdds = sm ? normOdds(sm) : null;
  let odds: OddsMercado | null = (espnOdds as unknown as OddsMercado | null) ?? null;
  let fonteOdd = (espnOdds as any)?.provider || (espnOdds ? "ESPN" : "—");

  // Cascata de odds: API-Football (se casar a fixture) → ESPN. A API-Football
  // traz o 1X2; o over/under vem do espnOdds passado como fallback.
  if (opts.usarApiFootball) {
    try {
      const cas = await oddsDoJogoComFallback(m.home.name, m.away.name, m.date, espnOdds);
      if (cas.odds) {
        odds = cas.odds as OddsMercado;
        fonteOdd = cas.source;
      }
    } catch {
      /* mantém as odds da ESPN */
    }
  }

  // Completa 1X2 com os preços do scoreboard, se a fonte de odds não trouxe.
  if (odds && m.prices) {
    odds = {
      ...odds,
      home: odds.home ?? m.prices.home,
      draw: odds.draw ?? m.prices.draw,
      away: odds.away ?? m.prices.away,
    };
  }

  const meta: MetaJogo = {
    matchId: m.id,
    league: m.league,
    leagueName: m.leagueName,
    country: m.country,
    kickoff: m.date,
    estado: m.state === "in" ? `AO VIVO ${m.clock || ""}`.trim() : horaSP(m.date),
    state: m.state,
    home: { id: m.home.id, name: m.home.name, logo: m.home.logo },
    away: { id: m.away.id, name: m.away.name, logo: m.away.logo },
  };

  const oportunidades = avaliarOportunidades({
    meta,
    probs: model.probs,
    odds,
    extras: model.extras,
    confianca: model.confidence,
    fonteOdd,
    minProb: opts.minProb,
    oddMin: opts.oddMin,
    oddMax: opts.oddMax,
  });

  return {
    ...meta,
    probs: model.probs,
    lambdaHome: model.lambdaHome,
    lambdaAway: model.lambdaAway,
    xgHome: model.xg.home,
    xgAway: model.xg.away,
    xgCoverage: model.xg.coverage,
    xgFonte: model.xg.fonte,
    extras: model.extras,
    topScores: model.topScores,
    confianca: model.confidence,
    h2hAjuste: model.h2hAjuste,
    h2h: (h2h.games || []).map((g: any) => ({
      golsCasa: Number(g.homeScore),
      golsFora: Number(g.awayScore),
      data: g.date,
    })),
    odds,
    fonteOdd,
    oportunidades,
  };
}

/**
 * Analisa os jogos do dia e devolve, além das oportunidades de valor, TODOS os
 * jogos avaliados (para a UI reaproveitar as probabilidades nos cards).
 */
export async function analisarOportunidades(opts: OportunidadesOpts = {}): Promise<OportunidadesResult> {
  const date = opts.date ?? hojeSP();
  const maxMatches = clamp(opts.maxMatches ?? 8, 1, 20);
  const limit = clamp(opts.limit ?? 30, 1, 200);
  const minProb = opts.minProb ?? MIN_PROB;
  const oddMin = opts.oddMin ?? ODD_MIN;
  const oddMax = opts.oddMax ?? ODD_MAX;
  const usarApiFootball = opts.usarApiFootball ?? true;
  const maxXgApi = clamp(opts.maxXgApi ?? 10, 0, 20);

  const todos = await getAllMatches(date);
  let cands = todos.filter((m) => m.state !== "post");
  if (opts.principais) cands = cands.filter((m) => leagueInfo(m.league).priority <= 9);
  cands = cands
    .sort((a, b) => leagueInfo(a.league).priority - leagueInfo(b.league).priority || a.date.localeCompare(b.date))
    .slice(0, maxMatches);

  /* Passo 1 — analisa tudo usando só o cache do Neon (nenhuma chamada de xG).
     Time já cacheado ganha o xG oficial de graça; o resto fica com o estimado. */
  const base = { minProb, oddMin, oddMax, usarApiFootball };
  const primeira = await Promise.allSettled(
    cands.map((m) => analisarJogo(m, { ...base, xgModo: "cache" })),
  );
  const pass1 = primeira
    .filter((r): r is PromiseFulfilledResult<AnaliseJogo | null> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((v): v is AnaliseJogo => v !== null);

  /* Passo 2 — só os N jogos de maior valor podem gastar chamada real de xG na
     API-Football (protege a cota). Reanalisamos apenas esses e substituímos. */
  const porId = new Map(cands.map((m) => [m.id, m]));
  const nota = (a: AnaliseJogo) => {
    const melhor = a.oportunidades.reduce((mx, o) => Math.max(mx, o.valor), 0);
    if (melhor > 0) return 1 + melhor; // valor manda
    return Math.max(a.probs.home, a.probs.away, a.probs.over25, a.probs.btts);
  };
  /* Lista em lote (ex.: Forebet com `usarApiFootball: false`) só aproveita o
     cache do Neon e nunca gasta chamada real de xG. */
  const podeApi = usarApiFootball && maxXgApi > 0;
  const topIds = podeApi
    ? [...pass1]
        .sort((x, y) => nota(y) - nota(x))
        .slice(0, maxXgApi)
        .map((a) => a.matchId)
    : [];

  const segunda = await Promise.allSettled(
    topIds.map((id) => {
      const m = porId.get(id);
      return m ? analisarJogo(m, { ...base, xgModo: "api" }) : Promise.resolve(null);
    }),
  );
  const upgrades = new Map<string, AnaliseJogo>();
  for (const r of segunda) {
    if (r.status === "fulfilled" && r.value) upgrades.set(r.value.matchId, r.value);
  }

  const analisados = pass1.map((a) => upgrades.get(a.matchId) ?? a);

  const oportunidades = analisados
    .flatMap((a) => a.oportunidades)
    .sort((a, b) => b.valor - a.valor || b.evPct - a.evPct)
    .slice(0, limit);

  return {
    geradoEm: new Date().toISOString(),
    fonte: "ESPN + API-Football (odds)",
    analisados,
    oportunidades,
  };
}

/** Só as melhores oportunidades, ordenadas por valor. */
export async function getBestOpportunities(opts: OportunidadesOpts = {}): Promise<OportunidadeValor[]> {
  const { oportunidades } = await analisarOportunidades(opts);
  return oportunidades;
}
