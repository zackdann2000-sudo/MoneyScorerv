/**
 * Tipos da UI do módulo /apitou.
 *
 * Espelham o JSON das rotas em /api/apitou/*. Mantidos à mão (não há geração
 * automática) de propósito: são poucos campos e servem de contrato explícito
 * entre backend e UI.
 */

export type AbaKey = "jogos" | "analise" | "desajustes";

/* --------------------------- /api/apitou/jogos --------------------------- */

export type JogoLista = {
  id: number;
  competicao: string;
  ligaId: number;
  home: string;
  away: string;
  kickoff: string;
  dia: string;
  jogadores: number;
  mercados: number;
  temEscalacao: boolean;
  arbitro: string | null;
};

export type JogosResp = {
  geradoEm: string;
  fonte: string;
  stale: boolean;
  total: number;
  dias: string[];
  jogos: JogoLista[];
};

/* ------------------------ /api/apitou/jogo/[id] -------------------------- */

export type PropAnalisada = {
  chave: string;
  mercado: string;
  mercadoRotulo: string;
  jogador: string;
  time: string;
  pos: string;
  linha: number;
  odd: number;
  probModelo: number;
  edge: number;
  qi: number;
  valor: number;
  confianca: number;
  mediaBase: number;
  amostra: number;
};

export type DesajusteItem = {
  chave: string;
  mercado: string;
  linha: number;
  odd: number;
  probModelo: number;
  probMercado: number;
  edge: number;
  qi: number;
  valor: number;
  nivel: "quente" | "bom" | "neutro";
  jogador: string;
  home: string;
  away: string;
};

export type Escalacao = {
  ts: string;
  adversario: string;
  formacao: string;
  tecnico: string;
  xi: { nome: string; num: number; pos: string }[];
};

export type Arbitro = {
  nome: string;
  jogos: number;
  amarelos: number;
  vermelhos: number;
  faltas: number;
  penaltis: number;
};

export type StatsTime = {
  jogos: number;
  gols: number;
  golsSof: number;
  cantos: number;
  cantosSof: number;
  fin: number;
  finSof: number;
  faltas: number;
  amarelos: number;
  posse: number;
  chutesGol: number;
};

export type H2HItem = {
  ts: string;
  comp: string;
  casa: string;
  fora: string;
  golsCasa: number;
  golsFora: number;
};

export type JogoDetalhe = {
  id: number;
  competicao: string;
  home: string;
  away: string;
  kickoff: string;
  arbitro: Arbitro | null;
  escHome: Escalacao | null;
  escAway: Escalacao | null;
  statsHome: StatsTime | null;
  statsAway: StatsTime | null;
  h2hResumo: H2HItem[];
  mercados: { mercado: string; periodos: Record<string, { linha: number; odd: number }[]> }[];
  jogadores: { nome: string; pos: string; time: string }[];
};

export type JogoResp = {
  geradoEm: string;
  stale: boolean;
  jogo: JogoDetalhe;
  mercadosDisponiveis: string[];
  props: PropAnalisada[];
  desajustes: DesajusteItem[];
  totais: { props: number; desajustes: number; quentes: number };
};

/* ---------------------- /api/apitou/desajustes --------------------------- */

export type DesajusteGlobal = {
  chave: string;
  fixtureId: number;
  mercado: string;
  linha: number;
  odd: number;
  probModelo: number;
  probMercado: number;
  edge: number;
  qi: number;
  valor: number;
  nivel: "quente" | "bom" | "neutro";
  jogador: string;
  home: string;
  away: string;
  kickoff: string;
  dia: string;
};

export type DesajustesResp = {
  geradoEm: string;
  stale: boolean;
  total: number;
  contagem: Record<string, number>;
  desajustes: DesajusteGlobal[];
};
