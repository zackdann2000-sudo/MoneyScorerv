/* Motor de RANKINGS POR MÉTRICA — puro, sem rede e sem banco.
   Recebe os jogos de cada equipe (já buscados) e devolve o ranking de um mercado.

   Regra do projeto: o que não tem dado NÃO entra na conta. Um jogo sem escanteios
   registrados não é "0 escanteios", é ausência de dado — e por isso sai do
   denominador em vez de derrubar a taxa. */

export type MercadoId = "over15" | "over25" | "btts" | "cleanSheet" | "over95corners" | "over35cards";

export type Periodo = 5 | 10 | 0; // 0 = temporada inteira

/** Mapa eventId → estatística do jogo (escanteios e cartões do TOTAL das duas equipes). */
export type EstatJogo = { corners: number | null; cards: number | null };

/** Um jogo na visão de uma equipe. `corners`/`cards` são o TOTAL do jogo. */
export type JogoEquipe = {
  id: string;
  date: string;
  home: boolean;
  gf: number;
  ga: number;
  /** total de escanteios do jogo (as duas equipes) — null quando não observado */
  corners: number | null;
  /** total de cartões do jogo (amarelos + vermelhos) — null quando não observado */
  cards: number | null;
};

export type TimeRanking = {
  id: string;
  nome: string;
  escudo: string;
  liga: string;
  ligaCodigo: string;
  /** jogos que entraram na conta (com dado para o mercado) */
  jogos: number;
  acertos: number;
  /** 0..1 */
  taxa: number;
};

export type Mercado = {
  id: MercadoId;
  rotulo: string;
  curto: string;
  /** frase de rodapé que explica o que está sendo contado */
  descricao: string;
  /** precisa de estatística do jogo (escanteios/cartões) e não só do placar */
  precisaEstat: boolean;
};

export const MERCADOS: Mercado[] = [
  { id: "over15", rotulo: "Over 1.5 gols", curto: "+1.5", descricao: "jogos com 2 gols ou mais", precisaEstat: false },
  { id: "over25", rotulo: "Over 2.5 gols", curto: "+2.5", descricao: "jogos com 3 gols ou mais", precisaEstat: false },
  { id: "btts", rotulo: "Ambas marcam", curto: "BTTS", descricao: "jogos em que as duas equipes marcaram", precisaEstat: false },
  { id: "cleanSheet", rotulo: "Clean sheet", curto: "CS", descricao: "jogos em que a equipe não sofreu gol", precisaEstat: false },
  { id: "over95corners", rotulo: "Over 9.5 escanteios", curto: "+9.5 ESC", descricao: "jogos com 10 escanteios ou mais no total", precisaEstat: true },
  { id: "over35cards", rotulo: "Over 3.5 cartões", curto: "+3.5 CART", descricao: "jogos com 4 cartões ou mais no total", precisaEstat: true },
];

export const mercadoPorId = (id: string | undefined | null): Mercado =>
  MERCADOS.find((m) => m.id === id) ?? MERCADOS[1];

/** Mínimo de jogos que a UI oferece como filtro. */
export const MINIMOS_JOGOS = [0, 5, 7, 10] as const;

/** Acertou ou não o mercado naquele jogo. `null` = sem dado, fica fora da conta. */
export function acertou(mercado: MercadoId, j: JogoEquipe): boolean | null {
  switch (mercado) {
    case "over15":
      return j.gf + j.ga >= 2;
    case "over25":
      return j.gf + j.ga >= 3;
    case "btts":
      return j.gf > 0 && j.ga > 0;
    case "cleanSheet":
      return j.ga === 0;
    case "over95corners":
      return j.corners == null ? null : j.corners >= 10;
    case "over35cards":
      return j.cards == null ? null : j.cards >= 4;
  }
}

/** Jogos da equipe dentro do período, do mais recente para o mais antigo. */
export function recortarPeriodo(jogos: JogoEquipe[], periodo: Periodo): JogoEquipe[] {
  const ordenados = [...jogos].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return periodo > 0 ? ordenados.slice(0, periodo) : ordenados;
}

export type EntradaTime = {
  id: string;
  nome: string;
  escudo: string;
  liga: string;
  ligaCodigo: string;
  jogos: JogoEquipe[];
};

/**
 * Ranking de um mercado. Só entram equipes com `minJogos` observações VÁLIDAS
 * para o mercado (não o total de jogos do período).
 */
export function ranquear(
  times: EntradaTime[],
  mercado: MercadoId,
  opts: { periodo?: Periodo; minJogos?: number; limite?: number } = {},
): TimeRanking[] {
  const periodo = opts.periodo ?? 10;
  const minJogos = opts.minJogos ?? 0;
  const out: TimeRanking[] = [];

  for (const t of times) {
    const recorte = recortarPeriodo(t.jogos, periodo);
    let jogos = 0;
    let acertos = 0;
    for (const j of recorte) {
      const ok = acertou(mercado, j);
      if (ok === null) continue;
      jogos += 1;
      if (ok) acertos += 1;
    }
    if (jogos === 0 || jogos < minJogos) continue;
    out.push({
      id: t.id,
      nome: t.nome,
      escudo: t.escudo,
      liga: t.liga,
      ligaCodigo: t.ligaCodigo,
      jogos,
      acertos,
      taxa: acertos / jogos,
    });
  }

  /* Ordenação: taxa primeiro; empate vai para quem tem amostra maior (menos
     frágil) e depois para mais acertos. Nunca por nome antes desses dois. */
  out.sort((a, b) => b.taxa - a.taxa || b.jogos - a.jogos || b.acertos - a.acertos || a.nome.localeCompare(b.nome));
  return typeof opts.limite === "number" ? out.slice(0, opts.limite) : out;
}

/** Quantas equipes passariam do filtro de mínimo (para o contador da UI). */
export function contarElegiveis(times: EntradaTime[], mercado: MercadoId, periodo: Periodo, minJogos: number): number {
  return ranquear(times, mercado, { periodo, minJogos }).length;
}

/**
 * Idade do dado em faixas, para a UI decidir a cor do selo "Atualizado há X".
 *  - `fresco`: até 24 h (é o ciclo do cron diário)
 *  - `atencao`: 24–48 h (o cron pode ter falhado um dia)
 *  - `defasado`: acima de 48 h (dado velho de fato)
 *  - `ausente`: sem registro no banco
 */
export type FaixaIdade = "fresco" | "atencao" | "defasado" | "ausente";

export const LIMITE_FRESCO_MS = 24 * 60 * 60 * 1000;
export const LIMITE_ATENCAO_MS = 48 * 60 * 60 * 1000;

export function faixaIdade(ms: number | null | undefined): FaixaIdade {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "ausente";
  if (ms < LIMITE_FRESCO_MS) return "fresco";
  if (ms < LIMITE_ATENCAO_MS) return "atencao";
  return "defasado";
}

/** Texto curto do selo: "agora", "há 12min", "há 3h", "há 2d". */
export function rotuloIdade(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "sem registro";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min}min`;
  const horas = Math.floor(min / 60);
  if (horas < 48) return `há ${horas}h`;
  return `há ${Math.floor(horas / 24)}d`;
}

/** Maior amostra disponível dentre todas as equipes (usado no rodapé). */
export function maiorAmostra(times: EntradaTime[], periodo: Periodo): number {
  return times.reduce((max, t) => Math.max(max, recortarPeriodo(t.jogos, periodo).length), 0);
}

/**
 * Lê um payload de `/scoreboard` da ESPN e devolve, por evento, o total de escanteios
 * e de cartões do jogo.
 *
 * Só considera jogos encerrados. Campo ausente vira `null` (nunca zero), porque
 * "não publicado" e "zero escanteios" são coisas diferentes.
 */
export function extrairEstatisticasScoreboard(raw: any): Map<string, EstatJogo> {
  const out = new Map<string, EstatJogo>();
  const eventos: any[] = raw?.events || [];
  for (const ev of eventos) {
    const id = String(ev?.id ?? "");
    const comp = ev?.competitions?.[0];
    if (!id || !comp) continue;
    const encerrado = comp?.status?.type?.state === "post" || comp?.status?.type?.completed === true;
    if (!encerrado) continue;

    let corners: number | null = null;
    for (const c of comp?.competitors || []) {
      const v = (c?.statistics || []).find((s: any) => s?.name === "wonCorners")?.displayValue;
      const n = v == null ? null : parseFloat(String(v));
      if (n == null || !Number.isFinite(n)) continue;
      corners = (corners ?? 0) + n;
    }

    let cards: number | null = null;
    const detalhes: any[] = comp?.details || [];
    if (detalhes.length) {
      cards = 0;
      for (const d of detalhes) {
        if (d?.yellowCard) cards += 1;
        if (d?.redCard) cards += 1;
      }
    }

    out.set(id, { corners, cards });
  }
  return out;
}
