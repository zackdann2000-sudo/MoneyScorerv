/* =======================================================================
   CATEGORIAS DAS ESTATÍSTICAS COMPARATIVAS DO TIME
   -----------------------------------------------------------------------
   Agrupa as métricas devolvidas pela API-Football (`/fixtures/statistics`)
   nos filtros em pílula da UI. As chaves aqui devem espelhar os `key`
   definidos em AF_TEAM_METRICS (src/lib/providers.ts).
   ======================================================================= */

export type MetricKey =
  | "ball_possession"
  | "expected_goals"
  | "goals"
  | "total_shots"
  | "shots_on_goal"
  | "shots_off_goal"
  | "blocked_shots"
  | "shots_insidebox"
  | "shots_outsidebox"
  | "total_passes"
  | "passes_accurate"
  | "corner_kicks"
  | "fouls"
  | "offsides"
  | "yellow_cards"
  | "red_cards"
  | "goalkeeper_saves"
  | "free_kicks"
  | "pass_pct"
  | "total_tackles"
  | "interceptions"
  | "total_clearance"
  | "total_crosses"
  | "penalty_kick_goals";

export type TeamStatMetric = {
  key: string;
  label: string;
  home: number;
  away: number;
  percent?: boolean;
};

/** Filtros em pílula, na ordem exibida. */
export const FILTROS = [
  { id: "todas", label: "Todas" },
  { id: "principais", label: "Principais" },
  { id: "ataque", label: "Ataque" },
  { id: "passes", label: "Passes" },
  { id: "defesa", label: "Defesa" },
  { id: "disciplina", label: "Disciplina" },
] as const;

export type FiltroId = (typeof FILTROS)[number]["id"];

/**
 * Métricas por categoria. Uma mesma métrica pode aparecer em mais de uma
 * categoria de propósito (ex.: finalizações em Ataque e em Principais) —
 * o consumidor deduplica.
 */
export const CATEGORIAS: Record<Exclude<FiltroId, "todas">, MetricKey[]> = {
  principais: [
    "goals",
    "ball_possession",
    "expected_goals",
    "total_shots",
    "shots_on_goal",
    "corner_kicks",
    "fouls",
    "yellow_cards",
    "goalkeeper_saves",
  ],
  ataque: [
    "goals",
    "total_shots",
    "shots_on_goal",
    "shots_off_goal",
    "blocked_shots",
    "shots_insidebox",
    "shots_outsidebox",
    "expected_goals",
    "corner_kicks",
    "offsides",
    "total_crosses",
    "penalty_kick_goals",
  ],
  passes: ["total_passes", "passes_accurate", "pass_pct", "ball_possession", "free_kicks"],
  defesa: [
    "goalkeeper_saves",
    "fouls",
    "blocked_shots",
    "shots_insidebox",
    "interceptions",
    "total_tackles",
    "total_clearance",
  ],
  disciplina: ["yellow_cards", "red_cards", "fouls", "offsides", "free_kicks"],
};

/** Filtra as métricas recebidas conforme o filtro escolhido. */
export function filtrar(métricas: TeamStatMetric[], filtro: FiltroId): TeamStatMetric[] {
  if (filtro === "todas") return métricas;
  const permitidas = new Set<string>(CATEGORIAS[filtro]);
  return métricas.filter((m) => permitidas.has(m.key));
}

/** Busca textual por nome da métrica (sem acento, case-insensitive). */
const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export function buscar(métricas: TeamStatMetric[], termo: string): TeamStatMetric[] {
  const q = semAcento(termo);
  if (!q) return métricas;
  return métricas.filter((m) => semAcento(m.label).includes(q) || semAcento(m.key).includes(q));
}

/* --------------------------- MÉDIAS ---------------------------------- */

/**
 * A API-Football não publica médias por jogo neste endpoint — entrega o
 * agregado da partida. Para o toggle "Médias" dividimos pelo número de
 * jogos da amostra do time. Com amostra 0 ou 1, o valor é o próprio total.
 */
export function comMedias(métricas: TeamStatMetric[], jogos: number): TeamStatMetric[] {
  if (!jogos || jogos <= 1) return métricas;
  return métricas.map((m) => ({
    ...m,
    /* Percentuais não se dividem: 57% de posse é sempre 57%. */
    home: m.percent ? m.home : +(m.home / jogos).toFixed(2),
    away: m.percent ? m.away : +(m.away / jogos).toFixed(2),
  }));
}
