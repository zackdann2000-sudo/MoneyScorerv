/**
 * The King STATS — cliente e cálculo de estatísticas.
 *
 * Origem: thekingstats.com (site público, sem autenticação nas rotas de dados).
 * Rotas descobertas na engenharia reversa do bundle Next.js:
 *   GET  /api/dashboard-cache?dayKey=YYYYMMDD -> { data: { games: Jogo[], statsMap, savedAt } }
 *   POST /api/dashboard-goal-stats { games:[{id,homeId,awayId}] } -> { stats: { [id]: { home: Partida[], away: Partida[] } } }
 *   GET  /api/dashboard-resumo -> desempenho/resultados (usado na aba Desempenho)
 *
 * Compatibilidade: o formato de `Jogo` é o do BetsAPI (id, sport_id, time unix,
 * league/home/away com id/name/image_id). Não alteramos os nomes de campo que
 * vêm da fonte para manter o parse simples e auditável.
 *
 * IMPORTANTE: a fonte só possui dados de HOJE e de dias passados. Dias futuros
 * respondem `{ data: null }`. Quem consome precisa lidar com isso.
 */

const BASE = "https://thekingstats.com";
const UA =
  "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36";

/* ------------------------------- tipos ---------------------------------- */

export type Jogo = {
  id: string;
  sport_id: string;
  time: string; // unix segundos
  time_status: string;
  league: { id: string; name: string; cc?: string | null };
  home: { id: string; name: string; image_id?: string; cc?: string | null };
  away: { id: string; name: string; image_id?: string; cc?: string | null };
  ss?: string | null;
  round?: string;
  bet365_id?: string;
};

/** Uma partida do histórico de uma equipe (já jogada). */
export type Partida = {
  id: string;
  d: number; // unix segundos
  h: boolean; // a equipe jogou em casa?
  gf: number; // gols pró
  ga: number; // gols contra
  hf?: number | null; // gols pró no 1º tempo
  ha?: number | null; // gols contra no 1º tempo
  o: string; // adversário
};

export type StatsJogo = { home: Partida[]; away: Partida[] };
export type StatsMap = Record<string, StatsJogo>;

/** Resumo estatístico de um conjunto de partidas (espelha a função `en` do site). */
export type ResumoEquipe = {
  n: number;
  over05ht: number | null;
  over15: number;
  over25: number;
  over35: number;
  btts: number;
  avgGoals: number;
  avgFor: number;
  avgAgainst: number;
  wins: number;
  draws: number;
  losses: number;
  ppg: number;
  cleanSheets: number;
  failedToScore: number;
  form: ("W" | "D" | "L")[];
};

/* ------------------------------ utilidades ------------------------------- */

const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0);
const avg = (soma: number, total: number) => (total > 0 ? Math.round((soma / total) * 100) / 100 : 0);

/** YYYYMMDD no fuso de São Paulo (o site usa esse fuso para o dayKey). */
export function diaKey(d = new Date()): string {
  return d
    .toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
    .replace(/-/g, "");
}

/** YYYY-MM-DD a partir de um dayKey YYYYMMDD. */
export function diaISO(dayKey: string): string {
  return `${dayKey.slice(0, 4)}-${dayKey.slice(4, 6)}-${dayKey.slice(6, 8)}`;
}

/**
 * Resumo de um conjunto de partidas.
 *
 * Porte fiel da função do site: contamos over 1.5/2.5/3.5 por total de gols,
 * BTTS por ambos marcarem, e o over 0.5 HT apenas quando a fonte tem gols de
 * 1º tempo (hf/ha não nulos) — senão devolvemos null em vez de inventar 0.
 */
export function resumirEquipe(partidas: Partida[]): ResumoEquipe {
  const n = partidas.length;
  let o15 = 0, o25 = 0, o35 = 0, btts = 0;
  let totGols = 0, totFor = 0, totAgainst = 0;
  let wins = 0, draws = 0, losses = 0;
  let cs = 0, fts = 0;
  let hCount = 0, hOver = 0;

  for (const p of partidas) {
    const total = p.gf + p.ga;
    totGols += total;
    totFor += p.gf;
    totAgainst += p.ga;
    if (total > 1.5) o15++;
    if (total > 2.5) o25++;
    if (total > 3.5) o35++;
    if (p.gf > 0 && p.ga > 0) btts++;
    if (p.gf > p.ga) wins++;
    else if (p.gf === p.ga) draws++;
    else losses++;
    if (p.ga === 0) cs++;
    if (p.gf === 0) fts++;
    if (p.hf != null && p.ha != null) {
      hCount++;
      if (p.hf + p.ha > 0) hOver++;
    }
  }

  return {
    n,
    over05ht: hCount > 0 ? pct(hOver, hCount) : null,
    over15: pct(o15, n),
    over25: pct(o25, n),
    over35: pct(o35, n),
    btts: pct(btts, n),
    avgGoals: avg(totGols, n),
    avgFor: avg(totFor, n),
    avgAgainst: avg(totAgainst, n),
    wins: pct(wins, n),
    draws: pct(draws, n),
    losses: pct(losses, n),
    ppg: avg(3 * wins + draws, n),
    cleanSheets: pct(cs, n),
    failedToScore: pct(fts, n),
    form: partidas.slice(0, 5).map((p) => (p.gf > p.ga ? "W" : p.gf === p.ga ? "D" : "L")),
  };
}

/** Filtra por mando ("home" | "away" | "all") e limita às N partidas mais recentes. */
export function ultimas(partidas: Partida[], mando: "home" | "away" | "all", n: number): Partida[] {
  const ordenadas = [...partidas].sort((a, b) => b.d - a.d);
  const filtradas =
    mando === "all" ? ordenadas : ordenadas.filter((p) => (mando === "home" ? p.h : !p.h));
  return filtradas.slice(0, n);
}

/* --------------------------------- fetch --------------------------------- */

async function getJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        "User-Agent": UA,
        Origin: BASE,
        Referer: `${BASE}/dashboard`,
        ...(init?.headers ?? {}),
      },
      // Sem cache do Next: nós controlamos o cache no Neon.
      cache: "no-store",
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export type DiaJogos = { dayKey: string; jogos: Jogo[]; savedAt: number | null };

/** Busca os jogos de um dia. Retorna `jogos: []` quando a fonte não tem o dia. */
export async function buscarJogos(dayKey: string): Promise<DiaJogos> {
  const res = await getJson<{ data: { games?: Jogo[]; savedAt?: number } | null }>(
    `${BASE}/api/dashboard-cache?dayKey=${dayKey}`,
  );
  const data = res?.data;
  if (!data || !Array.isArray(data.games)) return { dayKey, jogos: [], savedAt: null };
  return { dayKey, jogos: data.games, savedAt: data.savedAt ?? null };
}

/**
 * Busca o histórico de partidas de cada lado.
 *
 * LIMITE REAL DA FONTE: a rota devolve no máximo 10 jogos por chamada — testado
 * com 10, 20, 60 e 120; veio sempre 10. Então o lote útil é 10 e o custo é
 * ~0.3s por lote. Para 180 jogos são 18 lotes (~6s), que é aceitável porque o
 * resultado é cacheado.
 *
 * Concorrência 4: acelera sem parecer abuso da fonte. Pedir mais do que 10 no
 * corpo não adianta e só desperdiça.
 */
const LOTE_FONTE = 10;

async function buscarLote(pedaco: { id: string; homeId: string; awayId: string }[]) {
  const res = await getJson<{ stats?: StatsMap }>(`${BASE}/api/dashboard-goal-stats`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ games: pedaco }),
  });
  return res?.stats ?? {};
}

/**
 * Estatísticas de cada confronto, em lotes concorrentes.
 *
 * `prazoMs` é o orçamento de tempo: passado ele, o laço para e devolve o que
 * já chegou. Existe porque a rota de oportunidades tem teto de execução no
 * servidor (60s) e é melhor entregar parte dos jogos do que estourar o tempo e
 * perder tudo.
 */
export async function buscarStats(jogos: Jogo[], concorrencia = 4, prazoMs?: number): Promise<StatsMap> {
  const inicio = Date.now();
  const alvo = jogos
    .filter((j) => j.home?.id && j.away?.id)
    .map((j) => ({ id: j.id, homeId: j.home.id, awayId: j.away.id }));

  const lotes: { id: string; homeId: string; awayId: string }[][] = [];
  for (let i = 0; i < alvo.length; i += LOTE_FONTE) lotes.push(alvo.slice(i, i + LOTE_FONTE));

  const saida: StatsMap = {};
  for (let i = 0; i < lotes.length; i += concorrencia) {
    if (prazoMs != null && Date.now() - inicio > prazoMs) break;
    const grupo = lotes.slice(i, i + concorrencia);
    const parciais = await Promise.all(grupo.map(buscarLote));
    for (const p of parciais) Object.assign(saida, p);
  }
  return saida;
}

/* ------------------------------- desempenho ------------------------------ */

export type ItemResultado = {
  id: string;
  category: "ft" | "ht" | "esoccer" | string;
  mandante: string;
  visitante: string;
  mercado: string;
  odd: number;
  status: "green" | "red" | "void" | string;
  profit: number;
};

export type ResumoDesempenho = {
  hasPremium: boolean;
  counters: { total: number; ft: number; ht: number; esoccer: number };
  resumo: { jogosAnalisados: number; oportunidades: number; ft: number; ht: number; esoccer: number };
  desempenho: {
    units: number;
    greens: number;
    reds: number;
    voids: number;
    chart: number[];
    categorias: string[];
  };
  dias: { day: string; units: number }[];
  meses: { month: string; units: number }[];
  ultimosResultados: { day: string; items: ItemResultado[] };
  atualizadoEm: string;
};

/** Busca o painel de desempenho agregado (unidades, greens/reds, séries). */
export async function buscarResumo(): Promise<ResumoDesempenho | null> {
  return getJson<ResumoDesempenho>(`${BASE}/api/dashboard-resumo`);
}
