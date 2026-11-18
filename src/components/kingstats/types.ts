/**
 * Tipos do módulo King STATS no cliente.
 * Espelham o que as rotas /api/kingstats/* devolvem.
 */

export type JogoUI = {
  id: string;
  liga: string;
  home: string;
  away: string;
  homeId: string;
  awayId: string;
  kickoff: string; // unix segundos
  dia: string;
  esoccer: boolean;
};

export type JogosResp = {
  dayKey: string;
  dia: string;
  geradoEm: string;
  total: number;
  ligas: string[] | null;
  jogos: JogoUI[];
  cached?: boolean;
  idadeMs?: number;
};

export type Categoria = "ft" | "ht" | "btts";

export type Oportunidade = {
  jogoId: string;
  home: string;
  away: string;
  liga: string;
  kickoff: string;
  categoria: Categoria;
  mercado: string;
  prob: number;
  oddJusta: number;
  lambdaTotal: number;
  lambdaCasa: number;
  lambdaFora: number;
  confianca: number;
  nCasa: number;
  nFora: number;
  formCasa: string;
  formFora: string;
};

export type OportunidadesResp = {
  dayKey: string;
  dia: string;
  geradoEm: string;
  oportunidades: Oportunidade[];
  analisados: number;
  /** A varredura não cobriu todos os jogos do dia (fonte sem histórico ou prazo). */
  parcial?: boolean;
  cached?: boolean;
  stale?: boolean;
  idadeMs?: number;
  aviso?: string;
};

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

export type PartidaUI = {
  id: string;
  data: number;
  casa: boolean;
  gf: number;
  ga: number;
  adversario: string;
  resultado: "W" | "D" | "L";
};

export type ModeloJogo = {
  lambdaCasa: number;
  lambdaFora: number;
  lambdaTotal: number;
  prob: { over15: number; over25: number; over35: number; btts: number; over05ht: number };
  confianca: number;
  nCasa: number;
  nFora: number;
  formCasa: string;
  formFora: string;
};

export type JogoDetalheResp = {
  jogo: {
    id: string;
    liga: string;
    home: string;
    away: string;
    kickoff: string;
    dia: string;
    ss: string | null;
  };
  semHistorico: boolean;
  resumos?: {
    casa: { geral: ResumoEquipe; comoCasa: ResumoEquipe };
    fora: { geral: ResumoEquipe; comoFora: ResumoEquipe };
  };
  ultimas?: { casa: PartidaUI[]; fora: PartidaUI[] };
  modelo?: ModeloJogo | null;
};

export type ItemResultado = {
  id: string;
  category: string;
  mandante: string;
  visitante: string;
  mercado: string;
  odd: number;
  status: string;
  profit: number;
};

export type ResumoResp = {
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
  cached?: boolean;
};
