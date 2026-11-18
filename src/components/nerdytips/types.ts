/** Tipos do módulo /nerdytips (espelham o resumo que a API devolve). */

export type Status = "won" | "lost" | "void" | "pending";

export type Pick = {
  rotulo: string;
  texto: string;
  odd: number | null;
  confianca: number | null;
  pct: number | null;
  resultado: Status | null;
};

export type Jogo = {
  id: string;
  slug: string;
  liga: string;
  casa: string;
  fora: string;
  logos: [string | null, string | null];
  hora: string;
  kickoff: string;
  placar: { casa: number; fora: number } | null;
  status: Status;
  odds: { casa: number | null; empate: number | null; fora: number | null };
  pick1x2: Pick | null;
  pickGols: Pick | null;
  pickBtts: Pick | null;
  melhor: Pick | null;
  melhorTexto: string | null;
  placarExato: string | null;
};

export type CacheInfo = { source: "hit" | "miss" | "stale"; ageSeconds: number; ttlSeconds: number };

export type Board = {
  jogos: Jogo[];
  ligas: { nome: string; jogos: number }[];
  geradoEm: string;
  cache: CacheInfo;
};

export type Destaques = Board & {
  bankers: number | null;
  proximos: number | null;
  acerto: string | null;
  slip: { picks: number | null; odd: number | null } | null;
  /** "site" = bet-of-the-day liberado; "boards" = completado pelos boards. */
  fontePalpites?: "site" | "boards";
};

export type PalpiteCard = {
  rotulo: string;
  pick: string;
  texto: string;
  odd: number | null;
  confianca: number | null;
};

export type StatComparada = {
  rotulo: string;
  predCasa: string;
  predFora: string;
  realCasa: string | null;
  realFora: string | null;
};

export type Evento = { minuto: string; texto: string; placar: string | null; tipo: "gol" | "cartao" | "sub" | "outro" };

export type Partida = {
  id: string;
  liga: string;
  casa: string;
  fora: string;
  logos: [string | null, string | null];
  kickoffTs: number | null;
  status: string;
  encerrado: boolean;
  placar: { casa: number; fora: number } | null;
  odds: { casa: number | null; empate: number | null; fora: number | null };
  melhor: PalpiteCard | null;
  palpites: PalpiteCard[];
  stats: StatComparada[];
  eventos: Evento[];
  h2h: { total: number; vitoriasCasa: number; empates: number; vitoriasFora: number } | null;
  cache: CacheInfo;
};

export type Kpi = { valor: string; rotulo: string; sub: string };
export type MesRecorde = { mes: string; bankers: string; overall: string; bankersN: string; overallN: string };
export type Progresso = { kpis: Kpi[]; atualizadoEm: string | null; meses: MesRecorde[]; cache: CacheInfo };

export type ItemCombinada = {
  data: string;
  liga: string;
  ligaPais: string;
  ligaNome: string;
  ligaHref: string | null;
  casa: string;
  fora: string;
  logoCasa: string | null;
  logoFora: string | null;
  palpite: string;
  texto: string;
  odd: number | null;
  confianca: number | null;
};

export type Combinada = {
  rotulo: string;
  picks: number | null;
  oddTotal: number | null;
  oddCalculada: number | null;
  itens: ItemCombinada[];
  minTrust: number | null;
  maxTrust: number | null;
  lockMax: number | null;
  bloqueado: boolean;
  cache: CacheInfo;
};

export type Aba = "palpites" | "destaques" | "combinada" | "desempenho" | "partida";
