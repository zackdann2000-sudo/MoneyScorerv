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
  /** Quando a FONTE gerou o dado (não quando nós gravamos). */
  geradoEm: string;
  /** Quando nós gravamos o resumo no banco (ISO). */
  atualizadoEm?: string;
  /** Minutos desde a última gravação — frescor do nosso lado. */
  idadeMin?: number;
  fonte: string;
  /** Mais velho que o TTL de leitura (15 min). Não é erro. */
  stale: boolean;
  /** Existe atualização a caminho agora — é o que a tela pode anunciar. */
  revalidando?: boolean;
  total: number;
  dias: string[];
  jogos: JogoLista[];
};

/* ------------------------ /api/apitou/jogo/[id] -------------------------- */

export type PropAnalisada = {
  chave: string;
  fixtureId: number;
  home: string;
  away: string;
  competicao: string;
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
  fixtureId: number;
  competicao: string;
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
  // Campos adicionados depois: cache antigo no Neon pode não tê-los, por isso
  // são opcionais. Quem consome deve tratar `undefined` como "sem dado".
  faltasSof?: number;
  amarelosSof?: number;
  impedimentos?: number;
  impedimentosSof?: number;
  /**
   * Série dos últimos 10 jogos (mais recente primeiro). Opcional porque o
   * cache antigo no Neon pode não tê-la; quem lê trata como "sem dado".
   * É dela que saem as tendências do módulo (/apitou → Tendências).
   */
  serie?: {
    gols: number[];
    golsSof: number[];
    faltas: number[];
    faltasSof: number[];
    amarelos: number[];
    amarelosSof: number[];
    impedimentos: number[];
    impedimentosSof: number[];
  };
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
  atualizadoEm?: string;
  idadeMin?: number;
  stale: boolean;
  revalidando?: boolean;
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
  atualizadoEm?: string;
  idadeMin?: number;
  stale: boolean;
  revalidando?: boolean;
  /** true = agregação servida do cache de cálculo. */
  cached?: boolean;
  total: number;
  contagem: Record<string, number>;
  desajustes: DesajusteGlobal[];
};
